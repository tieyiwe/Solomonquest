import { Router, type IRouter } from "express";
import multer from "multer";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { scanFile } from "../lib/fileScan";
import { logger } from "../lib/logger";
import { notifyUsers } from "../lib/notifications";

const router: IRouter = Router();

const ATTACHMENTS_BUCKET = "chat-attachments";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

let bucketReady: Promise<void> | null = null;
/** Lazily ensures the storage bucket exists — created on first use rather
 * than requiring a manual dashboard step. */
function ensureAttachmentsBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = supabaseAdmin.storage
      .createBucket(ATTACHMENTS_BUCKET, { public: true, fileSizeLimit: 25 * 1024 * 1024 })
      .then(() => undefined)
      .catch((err) => {
        // "already exists" is expected after the first successful call
        if (!String(err?.message ?? err).toLowerCase().includes("already exists")) {
          logger.error({ err }, "Failed to create chat-attachments bucket");
        }
      });
  }
  return bucketReady;
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function assertChannelMember(
  channelId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}

/** Validate that a value looks like a UUID v4. */
function isUUID(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

// ─── GET /chat/channels ──────────────────────────────────────────────────────

router.get(
  "/chat/channels",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const includeArchived = req.query.archived === "true";

    const { data: memberships, error } = await supabaseAdmin
      .from("chat_channel_members")
      .select(
        `
        chat_channels (
          id,
          name,
          type,
          course_id,
          created_at,
          is_archived
        )
      `
      )
      .eq("user_id", req.userId ?? "");

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const channels = (memberships ?? [])
      .map((m: Record<string, unknown>) => {
        const channel = m.chat_channels as Record<string, unknown> | null;
        if (!channel) return null;
        return {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          courseId: channel.course_id,
          createdAt: channel.created_at,
          isArchived: channel.is_archived ?? false,
          unreadCount: 0,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .filter((c) => includeArchived || !c.isArchived);

    // For direct (1:1) channels, surface the other participant's presence
    // and read-receipt state so the DM header can show "Online"/"Last seen"
    // and messages can show a seen/double-check indicator.
    const directChannelIds = channels.filter((c) => c.type === "direct").map((c) => c.id as string);
    const otherUserByChannel = new Map<string, { id: string; name: string; role: string | null; onlineAt: string | null; lastReadAt: string | null }>();
    if (directChannelIds.length > 0) {
      const { data: allMembers } = await supabaseAdmin
        .from("chat_channel_members")
        .select("channel_id, user_id, last_read_at")
        .in("channel_id", directChannelIds);

      const otherMemberRows = (allMembers ?? []).filter((m) => m.user_id !== req.userId);
      const otherUserIds = Array.from(new Set(otherMemberRows.map((m) => m.user_id as string)));
      const { data: profiles } = otherUserIds.length
        ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, online_at, role").in("id", otherUserIds)
        : { data: [] as Record<string, unknown>[] };
      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

      for (const m of otherMemberRows) {
        const profile = profileById.get(m.user_id as string) as Record<string, unknown> | undefined;
        otherUserByChannel.set(m.channel_id as string, {
          id: m.user_id as string,
          name: profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unknown" : "Unknown",
          role: (profile?.role as string) ?? null,
          onlineAt: (profile?.online_at as string) ?? null,
          lastReadAt: (m.last_read_at as string) ?? null,
        });
      }
    }

    res.json(
      channels.map((c) => ({
        ...c,
        otherUser: otherUserByChannel.get(c.id as string) ?? null,
      }))
    );
  }
);

// ─── POST /chat/channels/:channelId/read — mark read up to now ──────────────

router.post(
  "/chat/channels/:channelId/read",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const channelId = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;

    const isMember = await assertChannelMember(channelId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    const { error } = await supabaseAdmin
      .from("chat_channel_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("user_id", req.userId!);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.sendStatus(204);
  }
);

// ─── PUT /chat/channels/:channelId/archive ───────────────────────────────────

router.put(
  "/chat/channels/:channelId/archive",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const channelId = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
    const { archived } = req.body as { archived?: boolean };

    const isMember = await assertChannelMember(channelId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("chat_channels")
      .update({ is_archived: archived !== false })
      .eq("id", channelId)
      .select("id, is_archived")
      .single();

    if (error || !data) {
      res.status(404).json({ error: error?.message ?? "Channel not found" });
      return;
    }

    res.json({ id: data.id, isArchived: data.is_archived });
  }
);

// ─── DELETE /chat/channels/:channelId ────────────────────────────────────────

router.delete(
  "/chat/channels/:channelId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const channelId = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;

    const { data: channel, error: fetchError } = await supabaseAdmin
      .from("chat_channels")
      .select("id, type, created_by")
      .eq("id", channelId)
      .single();

    if (fetchError || !channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    const isMember = await assertChannelMember(channelId, req.userId!);
    const isOwner = channel.created_by === req.userId;
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    // Anyone in a DM can delete it (there's no single "owner" of a direct
    // message); private/public channels require the creator or an admin.
    const canDelete = channel.type === "direct" ? isMember : isMember && (isOwner || isAdmin);

    if (!canDelete) {
      res.status(403).json({ error: "You do not have permission to delete this channel" });
      return;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("chat_channels")
      .delete()
      .eq("id", channelId);

    if (deleteError) {
      res.status(500).json({ error: deleteError.message });
      return;
    }

    res.sendStatus(204);
  }
);

// ─── POST /chat/channels ─────────────────────────────────────────────────────

router.post(
  "/chat/channels",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { name, type, memberIds } = req.body as {
      name?: string;
      type?: string;
      memberIds?: string[];
    };

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    if (type !== "private" && type !== "direct") {
      res.status(400).json({ error: "type must be 'private' or 'direct'" });
      return;
    }

    if (!Array.isArray(memberIds)) {
      res.status(400).json({ error: "memberIds must be an array" });
      return;
    }

    // Validate all memberIds are UUID strings
    for (const mid of memberIds) {
      if (!isUUID(mid)) {
        res.status(400).json({ error: `Invalid member id: ${mid}` });
        return;
      }
    }

    // Validate that all provided memberIds correspond to existing profiles
    if (memberIds.length > 0) {
      const { data: existingProfiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("id", memberIds);

      if (profilesError) {
        res.status(500).json({ error: profilesError.message });
        return;
      }

      const foundIds = new Set((existingProfiles ?? []).map((p: { id: string }) => p.id));
      const missingId = memberIds.find((mid) => !foundIds.has(mid));
      if (missingId) {
        res.status(400).json({ error: `Member not found: ${missingId}` });
        return;
      }
    }

    // For DM channels: prevent duplicate DM channels between the same two users
    if (type === "direct") {
      const otherMembers = memberIds.filter((mid) => mid !== req.userId);
      if (otherMembers.length !== 1) {
        res.status(400).json({ error: "A direct message channel must have exactly one other member" });
        return;
      }

      const otherId = otherMembers[0];

      // Find existing DM channels where the current user is a member
      const { data: callerMemberships, error: callerMembershipsError } = await supabaseAdmin
        .from("chat_channel_members")
        .select("channel_id")
        .eq("user_id", req.userId!);

      if (callerMembershipsError) {
        res.status(500).json({ error: callerMembershipsError.message });
        return;
      }

      const callerChannelIds = (callerMemberships ?? []).map(
        (m: { channel_id: string }) => m.channel_id
      );

      if (callerChannelIds.length > 0) {
        // Among those channels, find direct channels where the other user is also a member
        const { data: sharedDmChannels, error: sharedError } = await supabaseAdmin
          .from("chat_channel_members")
          .select("channel_id, chat_channels!inner(type)")
          .eq("user_id", otherId)
          .in("channel_id", callerChannelIds)
          .eq("chat_channels.type", "direct");

        if (sharedError) {
          res.status(500).json({ error: sharedError.message });
          return;
        }

        if (sharedDmChannels && sharedDmChannels.length > 0) {
          res.status(409).json({
            error: "A direct message channel between these users already exists",
            channelId: (sharedDmChannels[0] as any).channel_id,
          });
          return;
        }
      }
    }

    // A channel is a group conversation — the creator plus at least 2 others
    // (3 people total). Anything smaller should be a direct message instead.
    if (type === "private") {
      const otherMembers = new Set(memberIds.filter((mid) => mid !== req.userId));
      if (otherMembers.size < 2) {
        res.status(400).json({
          error: "A channel needs at least 3 people. Use a direct message for just one other person.",
        });
        return;
      }
    }

    // Insert channel
    const { data: channel, error: channelError } = await supabaseAdmin
      .from("chat_channels")
      .insert({
        name,
        type,
        school_id: req.schoolId ?? null,
        created_by: req.userId,
      })
      .select()
      .single();

    if (channelError) {
      res.status(400).json({ error: channelError.message });
      return;
    }

    // Build unique member set: creator + provided memberIds
    const uniqueIds = Array.from(new Set([req.userId!, ...memberIds]));
    const memberRows = uniqueIds.map((uid) => ({
      channel_id: channel.id,
      user_id: uid,
    }));

    const { error: membersError } = await supabaseAdmin
      .from("chat_channel_members")
      .insert(memberRows);

    if (membersError) {
      res.status(400).json({ error: membersError.message });
      return;
    }

    res.status(201).json({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      courseId: channel.course_id,
      schoolId: channel.school_id,
      createdBy: channel.created_by,
      createdAt: channel.created_at,
    });
  }
);

// ─── GET /chat/channels/:channelId/messages ──────────────────────────────────

router.get(
  "/chat/channels/:channelId/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { channelId } = req.params;

    const isMember = await assertChannelMember(channelId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    const limit = Math.min(
      parseInt((req.query.limit as string) ?? "50", 10) || 50,
      100
    );
    const before = req.query.before as string | undefined;

    let query = supabaseAdmin
      .from("chat_messages")
      .select(
        `
        id,
        content,
        thread_parent_id,
        created_at,
        is_edited,
        edited_at,
        sender_id,
        attachment_url,
        attachment_name,
        attachment_type,
        attachment_size,
        profiles:sender_id (
          first_name,
          last_name,
          avatar_url
        )
      `
      )
      .eq("channel_id", channelId)
      .is("thread_parent_id", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (before) {
      // Fetch the created_at of the cursor message so we can paginate by timestamp
      const { data: cursorMsg } = await supabaseAdmin
        .from("chat_messages")
        .select("created_at")
        .eq("id", before)
        .maybeSingle();

      if (cursorMsg) {
        query = query.lt("created_at", cursorMsg.created_at);
      }
    }

    const { data: messages, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Fetch reply counts for each top-level message
    const messageIds = (messages ?? []).map(
      (m: Record<string, unknown>) => m.id as string
    );

    let replyCounts: Record<string, number> = {};
    if (messageIds.length > 0) {
      const { data: counts } = await supabaseAdmin
        .from("chat_messages")
        .select("thread_parent_id")
        .in("thread_parent_id", messageIds);

      if (counts) {
        for (const row of counts as Array<{ thread_parent_id: string }>) {
          replyCounts[row.thread_parent_id] =
            (replyCounts[row.thread_parent_id] ?? 0) + 1;
        }
      }
    }

    const reactionsByMessage = await fetchReactions(messageIds);

    const result = (messages ?? []).map((m: Record<string, unknown>) => {
      const profile = m.profiles as Record<string, unknown> | null;
      return {
        id: m.id,
        channelId,
        content: m.content,
        threadParentId: m.thread_parent_id,
        isEdited: m.is_edited ?? false,
        editedAt: m.edited_at ?? null,
        replyCount: replyCounts[m.id as string] ?? 0,
        createdAt: m.created_at,
        attachmentUrl: m.attachment_url ?? null,
        attachmentName: m.attachment_name ?? null,
        attachmentType: m.attachment_type ?? null,
        attachmentSize: m.attachment_size ?? null,
        reactions: reactionsByMessage[m.id as string] ?? [],
        sender: {
          id: m.sender_id,
          name:
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unknown",
          firstName: profile?.first_name ?? null,
          lastName: profile?.last_name ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
      };
    });

    res.json(result);
  }
);

// ─── Reactions helpers ────────────────────────────────────────────────────────

type ReactionSummary = { emoji: string; count: number; userIds: string[] };

async function fetchReactions(
  messageIds: string[]
): Promise<Record<string, ReactionSummary[]>> {
  if (messageIds.length === 0) return {};

  const { data: rows } = await supabaseAdmin
    .from("chat_message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", messageIds);

  const byMessage: Record<string, Record<string, ReactionSummary>> = {};
  for (const row of (rows ?? []) as Array<{ message_id: string; user_id: string; emoji: string }>) {
    const forMessage = (byMessage[row.message_id] ??= {});
    const summary = (forMessage[row.emoji] ??= { emoji: row.emoji, count: 0, userIds: [] });
    summary.count += 1;
    summary.userIds.push(row.user_id);
  }

  const result: Record<string, ReactionSummary[]> = {};
  for (const [messageId, byEmoji] of Object.entries(byMessage)) {
    result[messageId] = Object.values(byEmoji);
  }
  return result;
}

// ─── POST /chat/channels/:channelId/messages ─────────────────────────────────

router.post(
  "/chat/channels/:channelId/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { channelId } = req.params;

    // Security: verify user is a member of the channel before allowing post
    const isMember = await assertChannelMember(channelId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    const { content, threadParentId } = req.body as {
      content?: string;
      threadParentId?: string;
    };

    if (!content || content.trim() === "") {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const { data: message, error } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        channel_id: channelId,
        sender_id: req.userId,
        content: content.trim(),
        thread_parent_id: threadParentId ?? null,
      })
      .select(
        `
        id,
        content,
        thread_parent_id,
        created_at,
        is_edited,
        edited_at,
        sender_id,
        profiles:sender_id (
          first_name,
          last_name,
          avatar_url
        )
      `
      )
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const profile = message.profiles as Record<string, unknown> | null;
    const senderName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Someone";

    res.status(201).json({
      id: message.id,
      channelId,
      content: message.content,
      threadParentId: message.thread_parent_id,
      isEdited: message.is_edited ?? false,
      editedAt: message.edited_at ?? null,
      createdAt: message.created_at,
      reactions: [],
      sender: {
        id: message.sender_id,
        name: senderName,
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
    });

    // Notify every other channel member — in-app row now, email if they're
    // not around to see it. Fire-and-forget: don't block the send on this.
    notifyOtherChannelMembers(channelId, req.userId!, senderName, content.trim()).catch((err) =>
      logger.error({ err }, "Failed to notify channel members of new chat message")
    );
  }
);

async function notifyOtherChannelMembers(
  channelId: string,
  senderId: string,
  senderName: string,
  content: string
): Promise<void> {
  const { data: members } = await supabaseAdmin
    .from("chat_channel_members")
    .select("user_id")
    .eq("channel_id", channelId);

  const recipientIds = (members ?? [])
    .map((m: Record<string, unknown>) => m.user_id as string)
    .filter((id) => id !== senderId);

  if (recipientIds.length === 0) return;

  const preview = content.length > 140 ? `${content.slice(0, 140)}…` : content;

  await notifyUsers({
    userIds: recipientIds,
    type: "chat_message",
    category: "chat",
    title: `New message from ${senderName}`,
    body: preview,
    link: `/chat`,
  });
}

// ─── POST /chat/channels/:channelId/attachments ──────────────────────────────
// Uploads pass through this server (not client-direct-to-storage, unlike the
// rest of the app) specifically so the file can be scanned before it's ever
// stored or shown to anyone.

router.post(
  "/chat/channels/:channelId/attachments",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { channelId } = req.params;

    const isMember = await assertChannelMember(channelId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const threadParentId = (req.body as { threadParentId?: string }).threadParentId;

    const scan = await scanFile(req.file.buffer, req.file.originalname);
    if (!scan.allowed) {
      res.status(422).json({ error: scan.reason ?? "This file could not be sent.", flagged: true });
      return;
    }

    await ensureAttachmentsBucket();

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${channelId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (uploadError) {
      res.status(500).json({ error: uploadError.message });
      return;
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);

    const { data: message, error } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        channel_id: channelId,
        sender_id: req.userId,
        content: req.file.originalname,
        thread_parent_id: threadParentId ?? null,
        attachment_url: publicUrlData.publicUrl,
        attachment_name: req.file.originalname,
        attachment_type: req.file.mimetype,
        attachment_size: req.file.size,
      })
      .select(
        `
        id,
        content,
        thread_parent_id,
        created_at,
        is_edited,
        edited_at,
        sender_id,
        attachment_url,
        attachment_name,
        attachment_type,
        attachment_size,
        profiles:sender_id (
          first_name,
          last_name,
          avatar_url
        )
      `
      )
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const profile = message.profiles as Record<string, unknown> | null;

    res.status(201).json({
      id: message.id,
      channelId,
      content: message.content,
      threadParentId: message.thread_parent_id,
      isEdited: message.is_edited ?? false,
      editedAt: message.edited_at ?? null,
      createdAt: message.created_at,
      attachmentUrl: message.attachment_url,
      attachmentName: message.attachment_name,
      attachmentType: message.attachment_type,
      attachmentSize: message.attachment_size,
      reactions: [],
      sender: {
        id: message.sender_id,
        name:
          [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unknown",
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
    });

    const senderName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Someone";
    notifyOtherChannelMembers(channelId, req.userId!, senderName, `Sent an attachment: ${req.file.originalname}`).catch(
      (err) => logger.error({ err }, "Failed to notify channel members of new chat attachment")
    );
  }
);

// ─── GET /chat/channels/:channelId/messages/:messageId/thread ────────────────

router.get(
  "/chat/channels/:channelId/messages/:messageId/thread",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { channelId, messageId } = req.params;

    const isMember = await assertChannelMember(channelId, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    const { data: replies, error } = await supabaseAdmin
      .from("chat_messages")
      .select(
        `
        id,
        content,
        thread_parent_id,
        created_at,
        is_edited,
        edited_at,
        sender_id,
        attachment_url,
        attachment_name,
        attachment_type,
        attachment_size,
        profiles:sender_id (
          first_name,
          last_name,
          avatar_url
        )
      `
      )
      .eq("channel_id", channelId)
      .eq("thread_parent_id", messageId)
      .order("created_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const replyIds = (replies ?? []).map((m: Record<string, unknown>) => m.id as string);
    const reactionsByMessage = await fetchReactions(replyIds);

    const result = (replies ?? []).map((m: Record<string, unknown>) => {
      const profile = m.profiles as Record<string, unknown> | null;
      return {
        id: m.id,
        channelId,
        content: m.content,
        threadParentId: m.thread_parent_id,
        isEdited: m.is_edited ?? false,
        editedAt: m.edited_at ?? null,
        createdAt: m.created_at,
        attachmentUrl: m.attachment_url ?? null,
        attachmentName: m.attachment_name ?? null,
        attachmentType: m.attachment_type ?? null,
        attachmentSize: m.attachment_size ?? null,
        reactions: reactionsByMessage[m.id as string] ?? [],
        sender: {
          id: m.sender_id,
          name:
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unknown",
          firstName: profile?.first_name ?? null,
          lastName: profile?.last_name ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
      };
    });

    res.json(result);
  }
);

// ─── GET /chat/messages/:messageId/reactions ─────────────────────────────────

router.get(
  "/chat/messages/:messageId/reactions",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { messageId } = req.params;
    const reactionsByMessage = await fetchReactions([messageId as string]);
    res.json({ reactions: reactionsByMessage[messageId as string] ?? [] });
  }
);

// ─── POST /chat/messages/:messageId/reactions ────────────────────────────────
// Toggle: if the caller already reacted with this emoji, remove it; otherwise add it.

router.post(
  "/chat/messages/:messageId/reactions",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { messageId } = req.params;
    const { emoji } = req.body as { emoji?: string };

    if (!emoji || emoji.trim() === "") {
      res.status(400).json({ error: "emoji is required" });
      return;
    }

    const { data: message } = await supabaseAdmin
      .from("chat_messages")
      .select("channel_id")
      .eq("id", messageId)
      .maybeSingle();

    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const isMember = await assertChannelMember(message.channel_id as string, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    const { data: existing } = await supabaseAdmin
      .from("chat_message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", req.userId!)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from("chat_message_reactions").delete().eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("chat_message_reactions")
        .insert({ message_id: messageId, user_id: req.userId!, emoji });
    }

    const reactionsByMessage = await fetchReactions([messageId as string]);
    res.json({ reactions: reactionsByMessage[messageId as string] ?? [] });
  }
);

// ─── Edit history ─────────────────────────────────────────────────────────────
// Messages can be edited after sending, but only within a short window — and
// every prior version is kept, not overwritten.

const EDIT_WINDOW_MS = 15 * 60 * 1000;

// ─── PATCH /chat/messages/:messageId ───────────────────────────────────────────

router.patch(
  "/chat/messages/:messageId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { messageId } = req.params;
    const { content } = req.body as { content?: string };

    if (!content || content.trim() === "") {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const { data: message } = await supabaseAdmin
      .from("chat_messages")
      .select("id, sender_id, content, created_at")
      .eq("id", messageId)
      .maybeSingle();

    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (message.sender_id !== req.userId) {
      res.status(403).json({ error: "You can only edit your own messages" });
      return;
    }

    const ageMs = Date.now() - new Date(message.created_at as string).getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      res.status(403).json({ error: "This message is too old to edit" });
      return;
    }

    const trimmed = content.trim();
    if (trimmed === message.content) {
      res.json({ id: message.id, content: message.content, isEdited: false, editedAt: null });
      return;
    }

    await supabaseAdmin.from("chat_message_edits").insert({
      message_id: messageId,
      previous_content: message.content,
      edited_by: req.userId!,
    });

    const editedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("chat_messages")
      .update({ content: trimmed, is_edited: true, edited_at: editedAt })
      .eq("id", messageId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ id: messageId, content: trimmed, isEdited: true, editedAt });
  }
);

// ─── GET /chat/messages/:messageId/edits ───────────────────────────────────────

router.get(
  "/chat/messages/:messageId/edits",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { messageId } = req.params;

    const { data: message } = await supabaseAdmin
      .from("chat_messages")
      .select("channel_id, content")
      .eq("id", messageId)
      .maybeSingle();

    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const isMember = await assertChannelMember(message.channel_id as string, req.userId!);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this channel" });
      return;
    }

    const { data: edits, error } = await supabaseAdmin
      .from("chat_message_edits")
      .select("previous_content, edited_at")
      .eq("message_id", messageId)
      .order("edited_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const history = [
      ...(edits ?? []).map((e) => ({ content: e.previous_content as string, editedAt: e.edited_at as string })),
      { content: message.content as string, editedAt: null },
    ];

    res.json({ history });
  }
);

// ─── POST /chat/channels/setup-school ────────────────────────────────────────

router.post(
  "/chat/channels/setup-school",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (req.userRole !== "admin" && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const schoolId = req.schoolId;
    if (!schoolId) {
      res.status(400).json({ error: "No school associated with this account" });
      return;
    }

    // Create General channel
    const { data: channel, error: channelError } = await supabaseAdmin
      .from("chat_channels")
      .insert({
        name: "General",
        type: "public",
        school_id: schoolId,
        created_by: req.userId,
      })
      .select()
      .single();

    if (channelError) {
      res.status(400).json({ error: channelError.message });
      return;
    }

    // Fetch all school members
    const { data: members, error: membersError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("school_id", schoolId);

    if (membersError) {
      res.status(500).json({ error: membersError.message });
      return;
    }

    const memberRows = (members ?? []).map((p: { id: string }) => ({
      channel_id: channel.id,
      user_id: p.id,
    }));

    if (memberRows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("chat_channel_members")
        .insert(memberRows);

      if (insertError) {
        res.status(400).json({ error: insertError.message });
        return;
      }
    }

    res.status(201).json({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      schoolId: channel.school_id,
      createdBy: channel.created_by,
      createdAt: channel.created_at,
      membersAdded: memberRows.length,
    });
  }
);

// ─── GET /chat/users — list school members for DM creation ──────────────────

router.get(
  "/chat/users",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const schoolId = req.schoolId;
    if (!schoolId) {
      res.status(400).json({ error: "No school associated with this account" });
      return;
    }

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, role, avatar_url")
      .eq("school_id", schoolId)
      .neq("id", req.userId!);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(
      (profiles ?? []).map((p: Record<string, unknown>) => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        role: p.role,
        avatarUrl: p.avatar_url,
      }))
    );
  }
);

export default router;

// ─── Exported helper — called from invitations.ts ────────────────────────────

/**
 * Ensure a "General" public channel exists for the school, then add the user
 * to every public channel in that school they are not yet a member of.
 * Also adds the creatorId (inviting admin) to the General channel if not present.
 */
export async function enrollUserInSchoolChannels(
  userId: string,
  schoolId: string,
  creatorId?: string
): Promise<void> {
  // 1. Ensure General channel exists
  let { data: general } = await supabaseAdmin
    .from("chat_channels")
    .select("id")
    .eq("school_id", schoolId)
    .eq("type", "public")
    .eq("name", "General")
    .maybeSingle();

  if (!general) {
    const { data: created, error: createErr } = await supabaseAdmin
      .from("chat_channels")
      .insert({
        name: "General",
        type: "public",
        school_id: schoolId,
        created_by: creatorId ?? userId,
      })
      .select("id")
      .single();

    if (createErr) {
      console.error("[chat] Failed to create General channel:", createErr.message);
      return;
    }
    general = created;
  }

  // 2. Fetch all public channels for this school
  const { data: publicChannels } = await supabaseAdmin
    .from("chat_channels")
    .select("id")
    .eq("school_id", schoolId)
    .eq("type", "public");

  const channelIds = (publicChannels ?? []).map((c: { id: string }) => c.id);
  if (channelIds.length === 0) return;

  // 3. Find which ones the user already belongs to
  const { data: existing } = await supabaseAdmin
    .from("chat_channel_members")
    .select("channel_id")
    .eq("user_id", userId)
    .in("channel_id", channelIds);

  const joined = new Set((existing ?? []).map((r: { channel_id: string }) => r.channel_id));
  const toJoin = channelIds.filter((id) => !joined.has(id));

  if (toJoin.length > 0) {
    await supabaseAdmin
      .from("chat_channel_members")
      .insert(toJoin.map((cid) => ({ channel_id: cid, user_id: userId })));
  }

  // 4. Also add creatorId (admin) to General channel if not already there
  if (creatorId && creatorId !== userId) {
    const { data: adminMembership } = await supabaseAdmin
      .from("chat_channel_members")
      .select("channel_id")
      .eq("channel_id", general.id)
      .eq("user_id", creatorId)
      .maybeSingle();

    if (!adminMembership) {
      await supabaseAdmin
        .from("chat_channel_members")
        .insert({ channel_id: general.id, user_id: creatorId });
    }
  }
}
