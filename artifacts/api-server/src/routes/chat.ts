import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

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
        id,
        last_seen,
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
          lastSeen: m.last_seen,
          unreadCount: 0,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .filter((c) => includeArchived || !c.isArchived);

    res.json(channels);
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
        sender_id,
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

    const result = (messages ?? []).map((m: Record<string, unknown>) => {
      const profile = m.profiles as Record<string, unknown> | null;
      return {
        id: m.id,
        channelId,
        content: m.content,
        threadParentId: m.thread_parent_id,
        replyCount: replyCounts[m.id as string] ?? 0,
        createdAt: m.created_at,
        sender: {
          id: m.sender_id,
          firstName: profile?.first_name ?? null,
          lastName: profile?.last_name ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
      };
    });

    res.json(result);
  }
);

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

    res.status(201).json({
      id: message.id,
      channelId,
      content: message.content,
      threadParentId: message.thread_parent_id,
      createdAt: message.created_at,
      sender: {
        id: message.sender_id,
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
    });
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
        sender_id,
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

    const result = (replies ?? []).map((m: Record<string, unknown>) => {
      const profile = m.profiles as Record<string, unknown> | null;
      return {
        id: m.id,
        channelId,
        content: m.content,
        threadParentId: m.thread_parent_id,
        createdAt: m.created_at,
        sender: {
          id: m.sender_id,
          firstName: profile?.first_name ?? null,
          lastName: profile?.last_name ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
      };
    });

    res.json(result);
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
      .select("id")
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
