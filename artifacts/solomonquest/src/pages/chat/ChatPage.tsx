import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Hash, Lock, MessageSquare, Phone, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { dashboardPathForRole } from "@/lib/roleHome";
import { useIsMobile } from "@/hooks/use-mobile";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChatAvatar, ParticipantColorProvider, useParticipantColorRegistry } from "@/components/chat/ChatAvatar";
import { ConversationList } from "@/components/chat/ConversationList";
import { MessageList } from "@/components/chat/MessageList";
import { MessageActionsSheet } from "@/components/chat/MessageActionsSheet";
import { Composer, type ComposerHandle } from "@/components/chat/Composer";
import { ThreadPanel, type ThreadEventMode, type ThreadListener } from "@/components/chat/ThreadPanel";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { useTyping } from "@/components/chat/useTyping";
import { ActiveCallOverlay, DashboardRail, IncomingCallBanner } from "@/components/chat/ChatChrome";
import { canEditMessage, type MessageHandlers } from "@/components/chat/MessageRow";
import { apiFetch, errorMessage, markDeleted, normalizeChannel, normalizeMessage, uploadAttachment } from "@/components/chat/chatApi";
import { formatLastSeen, isOnline } from "@/components/chat/format";
import { useVisualViewport } from "@/components/chat/useVisualViewport";
import type { ActiveCall, Channel, ChatMessage, IncomingCall } from "@/components/chat/types";

const PAGE_SIZE = 50;

function isPhoneWidth(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches;
}

function newOptimisticId() {
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toggleReactionLocally(msg: ChatMessage, emoji: string, userId: string): ChatMessage {
  const reactions = (msg.reactions ?? []).map((r) => ({ ...r, userIds: [...r.userIds] }));
  const r = reactions.find((x) => x.emoji === emoji);
  if (r && r.userIds.includes(userId)) {
    r.userIds = r.userIds.filter((u) => u !== userId);
    r.count = Math.max(0, r.count - 1);
  } else if (r) {
    r.userIds.push(userId);
    r.count += 1;
  } else {
    reactions.push({ emoji, count: 1, userIds: [userId] });
  }
  return { ...msg, reactions: reactions.filter((x) => x.count > 0) };
}

/** Preview patch when the conversation's latest message was deleted. */
function deletedPreview(c: Channel, messageId: string): Partial<Channel> {
  const lm = c.lastMessage;
  return lm && lm.id === messageId ? { lastMessage: { ...lm, content: "", attachmentName: null, deleted: true } } : {};
}

export default function ChatPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const vv = useVisualViewport(isMobile);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(null);
  const [threadParentId, setThreadParentId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [sheetMsg, setSheetMsg] = useState<ChatMessage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);

  const composerRef = useRef<ComposerHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const threadParentCache = useRef<ChatMessage | null>(null);
  const threadListeners = useRef(new Set<ThreadListener>());
  const pendingFiles = useRef(new Map<string, File>());
  const pendingTexts = useRef(new Map<string, string>());
  const lastReadSnapshot = useRef<{ channelId: string; lastReadAt: string | null; unread: number } | null>(null);
  const previousChannelId = useRef<string | null>(null);

  const currentUserId: string = user?.id ?? "";
  const currentUserName: string =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    (user as any)?.full_name ||
    (user as any)?.name ||
    user?.email ||
    "You";

  // Refs so long-lived callbacks (realtime, memoised row handlers) always
  // see current values without being recreated on every render.
  const activeChannelRef = useRef<Channel | null>(null);
  activeChannelRef.current = activeChannel;
  const channelsRef = useRef<Channel[]>([]);
  channelsRef.current = channels;
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const activeCallRef = useRef<ActiveCall | null>(null);
  activeCallRef.current = activeCall;
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  // -------------------------------------------------------------------------
  // Channels
  // -------------------------------------------------------------------------

  const patchChannel = useCallback((id: string, patch: Partial<Channel> | ((c: Channel) => Partial<Channel>)) => {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)));
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      // ?archived=true returns archived and active channels; they're split
      // client-side so the Archived section needs no second round trip.
      const res = await apiFetch("/api/chat/channels?archived=true");
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to load channels"));
      const data: Channel[] = ((await res.json()) as any[]).map(normalizeChannel);
      setChannels(data);
      // Desktop opens the first conversation; phones start on the list.
      if (!activeChannelRef.current && !isPhoneWidth()) {
        const firstActive = data.find((c) => !c.isArchived);
        if (firstActive) openChannel(firstActive, { pushHistory: false });
      }
      return data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load channels");
      return null;
    } finally {
      setChannelsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // -------------------------------------------------------------------------
  // Opening / leaving a conversation (phones: list ⇄ conversation screens,
  // wired to browser history so the system back gesture returns to the list)
  // -------------------------------------------------------------------------

  function openChannel(ch: Channel, { pushHistory = true }: { pushHistory?: boolean } = {}) {
    const wasOpen = !!activeChannelRef.current;
    lastReadSnapshot.current = { channelId: ch.id, lastReadAt: ch.lastReadAt ?? null, unread: ch.unread_count ?? 0 };
    setActiveChannel(ch);
    setMessages([]);
    setHasMore(false);
    setUnreadAnchorId(null);
    setThreadParentId(null);
    setEditing(null);
    setSheetMsg(null);
    setConfirmDelete(null);
    patchChannel(ch.id, { unread_count: 0, lastReadAt: new Date().toISOString() });
    apiFetch(`/api/chat/channels/${ch.id}/read`, { method: "POST" }).catch(() => {});
    if (pushHistory && isPhoneWidth() && !wasOpen) {
      window.history.pushState({ ...(window.history.state ?? {}), sqChat: ch.id }, "");
    }
  }

  const selectChannel = useCallback((ch: Channel) => {
    if (activeChannelRef.current?.id === ch.id) {
      if (isMobileRef.current) headingRef.current?.focus();
      else composerRef.current?.focus();
      return;
    }
    openChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeConversation() {
    if (window.history.state?.sqChat) window.history.back();
    else setActiveChannel(null);
  }

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (!e.state?.sqChat && activeChannelRef.current && isPhoneWidth()) {
        setThreadParentId(null);
        setActiveChannel(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Focus management when the conversation changes.
  useEffect(() => {
    if (activeChannel) {
      previousChannelId.current = activeChannel.id;
      requestAnimationFrame(() => {
        if (isMobileRef.current) headingRef.current?.focus({ preventScroll: true });
        else composerRef.current?.focus();
      });
    } else if (previousChannelId.current) {
      const id = previousChannelId.current;
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-conv-row="${id}"]`)?.focus());
    }
  }, [activeChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function archiveChannel(ch: Channel, archived: boolean) {
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}/archive`, { method: "PUT", body: JSON.stringify({ archived }) });
      if (!res.ok) throw new Error(await errorMessage(res, "Request failed"));
      patchChannel(ch.id, { isArchived: archived });
      if (archived && activeChannelRef.current?.id === ch.id) leaveDeletedOrArchived(ch.id);
      toast.success(archived ? `Archived "${ch.name}"` : `Unarchived "${ch.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update channel");
    }
  }

  async function deleteChannel(ch: Channel) {
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Request failed"));
      setChannels((prev) => prev.filter((c) => c.id !== ch.id));
      if (activeChannelRef.current?.id === ch.id) leaveDeletedOrArchived(ch.id);
      toast.success(`Deleted "${ch.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete channel");
    }
  }

  function leaveDeletedOrArchived(id: string) {
    if (isPhoneWidth()) {
      closeConversation();
      return;
    }
    const next = channelsRef.current.find((c) => c.id !== id && !c.isArchived) ?? null;
    if (next) openChannel(next, { pushHistory: false });
    else setActiveChannel(null);
  }

  function handleChannelCreated(ch: Channel) {
    setChannels((prev) => (prev.some((c) => c.id === ch.id) ? prev : [...prev, ch]));
    openChannel(ch);
  }

  async function openDmWith(userId: string, name: string): Promise<boolean> {
    try {
      const res = await apiFetch("/api/chat/channels", {
        method: "POST",
        body: JSON.stringify({ name, type: "direct", memberIds: [userId] }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // DM already exists — select it (re-fetching the list if it's new to us).
        const existingId: string = body.channelId;
        const local = channelsRef.current.find((c) => c.id === existingId);
        if (local) selectChannel(local);
        else {
          const all = await fetchChannels();
          const found = all?.find((c) => c.id === existingId);
          if (found) selectChannel(found);
        }
        return true;
      }
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      handleChannelCreated(normalizeChannel(body));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open conversation");
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  // Realtime INSERT payloads only carry raw chat_messages columns (sender_id,
  // no joined profile). This cache, filled from every REST response, lets a
  // live message render with its sender's name straight away.
  const senderCacheRef = useRef<Map<string, ChatMessage["sender"]>>(new Map());
  const cacheSenders = useCallback((msgs: ChatMessage[]) => {
    for (const m of msgs) if (m.sender?.id && m.sender.name) senderCacheRef.current.set(m.sender.id, m.sender);
  }, []);
  // Deleted placeholders only carry a sender id; name them from the cache.
  const withKnownSenders = useCallback(
    (msgs: ChatMessage[]) =>
      msgs.map((m) => {
        if (m.sender?.name || !m.sender?.id) return m;
        const known = senderCacheRef.current.get(m.sender.id);
        return known ? { ...m, sender: known } : m;
      }),
    []
  );
  useEffect(() => {
    if (currentUserId)
      senderCacheRef.current.set(currentUserId, { id: currentUserId, name: currentUserName, avatar_url: user?.avatarUrl ?? null });
  }, [currentUserId, currentUserName, user?.avatarUrl]);

  useEffect(() => {
    const ch = activeChannel;
    if (!ch) return;
    let alive = true;
    setMessagesLoading(true);
    (async () => {
      try {
        const res = await apiFetch(`/api/chat/channels/${ch.id}/messages?limit=${PAGE_SIZE}`);
        if (!res.ok) throw new Error(await errorMessage(res, "Failed to load messages"));
        const loaded: ChatMessage[] = ((await res.json()) as any[]).map(normalizeMessage);
        if (!alive) return;
        cacheSenders(loaded);
        const data = withKnownSenders(loaded);
        // Keep anything optimistic that was sent while the page loaded.
        setMessages((prev) => [...data, ...prev.filter((m) => m._optimistic && m.channel_id === ch.id)]);
        setHasMore(data.length >= PAGE_SIZE);
        // "New messages" divider: first message from someone else after the
        // read mark captured when the conversation was opened.
        const snap = lastReadSnapshot.current;
        if (snap && snap.channelId === ch.id && snap.unread > 0) {
          const since = snap.lastReadAt ? new Date(snap.lastReadAt).getTime() : 0;
          const first = data.find((m) => m.sender?.id !== currentUserId && new Date(m.created_at).getTime() > since);
          setUnreadAnchorId(first?.id ?? null);
        }
      } catch (err) {
        if (alive) toast.error(err instanceof Error ? err.message : "Failed to load messages");
      } finally {
        if (alive) setMessagesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeChannel?.id, cacheSenders, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = useCallback(async () => {
    const ch = activeChannelRef.current;
    const oldest = messagesRef.current.find((m) => !m._optimistic);
    if (!ch || !oldest) return 0;
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest.id)}`);
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to load older messages"));
      const loaded: ChatMessage[] = ((await res.json()) as any[]).map(normalizeMessage);
      if (activeChannelRef.current?.id !== ch.id) return 0;
      cacheSenders(loaded);
      const page = withKnownSenders(loaded);
      const have = new Set(messagesRef.current.map((m) => m.id));
      const older = page.filter((m) => !have.has(m.id));
      if (older.length) setMessages((prev) => [...older.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(page.length >= PAGE_SIZE);
      return older.length;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load older messages");
      return 0;
    }
  }, [cacheSenders, withKnownSenders]);

  // -------------------------------------------------------------------------
  // Realtime — one socket for the open conversation (messages, edits,
  // reactions, DM read receipts) …
  // -------------------------------------------------------------------------

  const resolveSender = useCallback((senderId: string) => {
    apiFetch(`/api/users/${senderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => {
        if (!profile) return;
        const resolved = {
          id: profile.id,
          name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Unknown",
          avatar_url: profile.avatarUrl ?? null,
        };
        senderCacheRef.current.set(resolved.id, resolved);
        setMessages((prev) => prev.map((m) => (m.sender?.id === resolved.id && !m.sender.name ? { ...m, sender: resolved } : m)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeChannel) return;
    const channelId = activeChannel.id;
    const isDirectWithOther = activeChannel.type === "direct" && !!activeChannel.otherUser;
    const otherUserId = activeChannel.otherUser?.id;
    const channel = supabase
      .channel(`chat-active:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const raw = payload.new as Record<string, unknown> & { sender_id?: string };
          const cached = raw.sender_id ? senderCacheRef.current.get(raw.sender_id) : undefined;
          const msg = normalizeMessage({ ...raw, sender: cached ?? { id: raw.sender_id ?? "", name: "" } });
          if (!cached && raw.sender_id) resolveSender(raw.sender_id);

          if (msg.thread_parent_id) {
            threadListeners.current.forEach((fn) => fn(msg, "insert"));
            // Own replies were already counted optimistically by the thread panel.
            if (msg.sender.id !== currentUserId) {
              setMessages((prev) =>
                prev.map((m) => (m.id === msg.thread_parent_id ? { ...m, thread_count: (m.thread_count ?? 0) + 1 } : m))
              );
            }
            return;
          }
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.sender.id !== currentUserId) {
            const who = msg.sender.name || "Someone";
            const body = msg.attachmentName ? `sent ${msg.attachmentName}` : msg.content.slice(0, 120);
            setAnnouncement(`New message from ${who}: ${body}`);
            if (document.visibilityState === "visible") {
              apiFetch(`/api/chat/channels/${channelId}/read`, { method: "POST" }).catch(() => {});
            }
          }
        }
      )
      // Edits and deletions made by others (or in another tab) show up live.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const row = payload.new as {
            id?: string;
            content?: string;
            is_edited?: boolean;
            edited_at?: string | null;
            deleted_at?: string | null;
            thread_parent_id?: string | null;
          };
          if (!row?.id) return;
          if (row.deleted_at) {
            applyDeletion(row.id, row.deleted_at, row.thread_parent_id ?? null);
            return;
          }
          if (row.thread_parent_id) {
            const edited = normalizeMessage({ ...row, sender: { id: "", name: "" } });
            threadListeners.current.forEach((fn) => fn(edited, "edit"));
            return;
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.id && !m.deleted && (m.content !== row.content || m.isEdited !== !!row.is_edited)
                ? { ...m, content: row.content ?? m.content, isEdited: !!row.is_edited, editedAt: row.edited_at ?? m.editedAt }
                : m
            )
          );
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions" }, (payload) => {
        const row = (payload.new ?? payload.old) as { message_id?: string } | null;
        const messageId = row?.message_id;
        if (!messageId || !messagesRef.current.some((m) => m.id === messageId)) return;
        apiFetch(`/api/chat/messages/${messageId}/reactions`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return;
            setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m)));
          })
          .catch(() => {});
      });

    // Live read receipts: the other DM member's last_read_at flips the ticks.
    if (isDirectWithOther) {
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_channel_members", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const row = payload.new as { user_id?: string; last_read_at?: string | null };
          if (row.user_id !== otherUserId) return;
          setActiveChannel((prev) =>
            prev && prev.otherUser ? { ...prev, otherUser: { ...prev.otherUser, lastReadAt: row.last_read_at ?? null } } : prev
          );
        }
      );
    }

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannel?.id, activeChannel?.type, activeChannel?.otherUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // … and one for the page's lifetime: unread counts / previews for every
  // conversation, and incoming-call ringing.
  useEffect(() => {
    const sub = supabase
      .channel("chat-user-global")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const msg = payload.new as {
          id: string;
          channel_id: string;
          sender_id: string;
          content?: string;
          created_at?: string;
          attachment_name?: string | null;
          thread_parent_id?: string | null;
        };
        if (msg.thread_parent_id) return; // threads don't badge or preview
        if (!channelsRef.current.some((c) => c.id === msg.channel_id)) return;
        const isActive = msg.channel_id === activeChannelRef.current?.id;
        const fromOther = msg.sender_id !== currentUserId;
        patchChannel(msg.channel_id, (c) => ({
          lastMessage: {
            id: msg.id,
            content: msg.content ?? "",
            createdAt: msg.created_at ?? new Date().toISOString(),
            senderId: msg.sender_id,
            senderName: senderCacheRef.current.get(msg.sender_id)?.name ?? null,
            attachmentName: msg.attachment_name ?? null,
          },
          unread_count: fromOther && !isActive ? (c.unread_count ?? 0) + 1 : c.unread_count,
        }));
      })
      // A deleted latest message turns that conversation's preview into
      // "Message deleted" (the active conversation is handled by applyDeletion).
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, (payload) => {
        const row = payload.new as { id?: string; channel_id?: string; deleted_at?: string | null; thread_parent_id?: string | null };
        if (!row?.id || !row.channel_id || !row.deleted_at || row.thread_parent_id) return;
        patchChannel(row.channel_id, (c) => deletedPreview(c, row.id!));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_calls" }, (payload) => {
        const call = payload.new as { id: string; channel_id: string; jitsi_room: string; status: string; started_by?: string | null };
        if (call.status !== "active" || call.started_by === currentUserId) return;
        const channel = channelsRef.current.find((c) => c.id === call.channel_id);
        if (!channel) return;
        setIncomingCall({ id: call.id, jitsiRoom: call.jitsi_room, channelId: call.channel_id, channelName: channel.name });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_calls" }, (payload) => {
        const call = payload.new as { id: string; status: string };
        if (call.status !== "ended") return;
        if (activeCallRef.current?.id === call.id) setActiveCall(null);
        setIncomingCall((prev) => (prev?.id === call.id ? null : prev));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Ringtone (Web Audio, no asset) while a call rings unanswered.
  useEffect(() => {
    if (!incomingCall) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return;
    }
    const playChime = () => {
      if (!ctx) return;
      [880, 660].forEach((freq, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.15, ctx!.currentTime + i * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx!.currentTime + i * 0.25 + 0.22);
        osc.connect(gain);
        gain.connect(ctx!.destination);
        osc.start(ctx!.currentTime + i * 0.25);
        osc.stop(ctx!.currentTime + i * 0.25 + 0.25);
      });
    };
    playChime();
    const interval = setInterval(playChime, 2500);
    return () => {
      clearInterval(interval);
      ctx?.close().catch(() => {});
    };
  }, [incomingCall?.id]);

  // Presence ping — 5 min cadence against the 10 min online threshold.
  useEffect(() => {
    const ping = () => apiFetch("/api/users/me/online", { method: "PUT" }).catch(() => {});
    ping();
    const iv = setInterval(ping, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // -------------------------------------------------------------------------
  // Sending (optimistic, with retry on failure)
  // -------------------------------------------------------------------------

  const settleOptimistic = useCallback((optimisticId: string, saved: ChatMessage) => {
    setMessages((prev) =>
      // Realtime may have delivered the saved row first — then just drop the placeholder.
      prev.some((m) => m.id === saved.id) ? prev.filter((m) => m.id !== optimisticId) : prev.map((m) => (m.id === optimisticId ? saved : m))
    );
    patchChannel(saved.channel_id, {
      lastMessage: {
        id: saved.id,
        content: saved.content,
        createdAt: saved.created_at,
        senderId: currentUserId,
        senderName: currentUserName,
        attachmentName: saved.attachmentName ?? null,
      },
    });
  }, [currentUserId, currentUserName, patchChannel]);

  const failOptimistic = useCallback((optimisticId: string, err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, _uploading: false, _failed: message } : m)));
  }, []);

  const sendText = useCallback(
    async (content: string, retryId?: string) => {
      const ch = activeChannelRef.current;
      if (!ch) return;
      const id = retryId ?? newOptimisticId();
      pendingTexts.current.set(id, content);
      const optimistic: ChatMessage = {
        id,
        channel_id: ch.id,
        content,
        created_at: new Date().toISOString(),
        sender: { id: currentUserId, name: currentUserName, avatar_url: user?.avatarUrl ?? null },
        _optimistic: true,
      };
      setMessages((prev) => (retryId ? [...prev.filter((m) => m.id !== retryId), optimistic] : [...prev, optimistic]));
      try {
        const res = await apiFetch(`/api/chat/channels/${ch.id}/messages`, { method: "POST", body: JSON.stringify({ content }) });
        if (!res.ok) throw new Error(await errorMessage(res, "Message not sent"));
        const saved = normalizeMessage(await res.json());
        pendingTexts.current.delete(id);
        settleOptimistic(id, { ...saved, sender: saved.sender?.name ? saved.sender : optimistic.sender });
      } catch (err) {
        failOptimistic(id, err, "Message not sent");
      }
    },
    [currentUserId, currentUserName, user?.avatarUrl, settleOptimistic, failOptimistic]
  );

  const sendFile = useCallback(
    async (file: File, retryId?: string) => {
      const ch = activeChannelRef.current;
      if (!ch) return;
      const id = retryId ?? newOptimisticId();
      pendingFiles.current.set(id, file);
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      const optimistic: ChatMessage = {
        id,
        channel_id: ch.id,
        content: file.name,
        created_at: new Date().toISOString(),
        attachmentName: file.name,
        attachmentType: file.type,
        attachmentSize: file.size,
        sender: { id: currentUserId, name: currentUserName, avatar_url: user?.avatarUrl ?? null },
        _optimistic: true,
        _uploading: true,
        _progress: 0,
        _previewUrl: previewUrl,
      };
      setMessages((prev) => (retryId ? [...prev.filter((m) => m.id !== retryId), optimistic] : [...prev, optimistic]));
      try {
        const saved = await uploadAttachment(ch.id, file, (pct) =>
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, _progress: pct } : m)))
        );
        pendingFiles.current.delete(id);
        settleOptimistic(id, { ...saved, sender: saved.sender?.name ? saved.sender : optimistic.sender });
      } catch (err) {
        failOptimistic(id, err, "File not sent");
      } finally {
        // Give the real image a moment to replace the local preview.
        if (previewUrl) setTimeout(() => URL.revokeObjectURL(previewUrl), 30000);
      }
    },
    [currentUserId, currentUserName, user?.avatarUrl, settleOptimistic, failOptimistic]
  );

  const onComposerSend = useCallback(
    (text: string, files: File[]) => {
      files.forEach((f) => void sendFile(f));
      if (text) void sendText(text);
    },
    [sendFile, sendText]
  );

  async function saveEdit(id: string, content: string): Promise<boolean> {
    try {
      const res = await apiFetch(`/api/chat/messages/${id}`, { method: "PATCH", body: JSON.stringify({ content }) });
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to edit message"));
      const data = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: data.content, isEdited: data.isEdited, editedAt: data.editedAt } : m)));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to edit message");
      return false;
    }
  }

  /** Turn a message (top-level or thread reply) into its deleted placeholder. */
  function applyDeletion(id: string, deletedAt: string | null, threadParentId: string | null) {
    if (threadParentId) {
      const stub = { id, thread_parent_id: threadParentId, deletedAt } as ChatMessage;
      threadListeners.current.forEach((fn) => fn(stub, "delete"));
    } else {
      setMessages((prev) => prev.map((m) => (m.id === id && !m.deleted ? markDeleted(m, deletedAt) : m)));
      const ch = activeChannelRef.current;
      if (ch) {
        patchChannel(ch.id, (c) => deletedPreview(c, id));
      }
    }
    setEditing((e) => (e?.id === id ? null : e));
    setSheetMsg((m) => (m?.id === id ? null : m));
    if (threadParentCache.current?.id === id) threadParentCache.current = markDeleted(threadParentCache.current, deletedAt);
  }

  // Optimistic delete with rollback.
  async function performDelete(msg: ChatMessage) {
    const channelId = msg.channel_id;
    const prevPreview = channelsRef.current.find((c) => c.id === channelId)?.lastMessage ?? null;
    applyDeletion(msg.id, new Date().toISOString(), msg.thread_parent_id ?? null);
    try {
      const res = await apiFetch(`/api/chat/messages/${msg.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Couldn't delete message"));
    } catch (err) {
      if (msg.thread_parent_id) {
        threadListeners.current.forEach((fn) => fn(msg, "replace" as ThreadEventMode));
      } else {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        if (prevPreview?.id === msg.id) patchChannel(channelId, { lastMessage: prevPreview });
      }
      if (threadParentCache.current?.id === msg.id) threadParentCache.current = msg;
      toast.error(err instanceof Error ? err.message : "Couldn't delete message");
    }
  }

  function editLastOwn() {
    const mine = [...messagesRef.current].reverse().find((m) => canEditMessage(m, currentUserId));
    if (mine) setEditing({ id: mine.id, content: mine.content });
  }

  // -------------------------------------------------------------------------
  // Row handlers — one stable object so memoised rows don't re-render
  // -------------------------------------------------------------------------

  // Group-channel creators and school admins can remove anyone's message
  // (mirrors DELETE /chat/messages/:id); everyone can remove their own.
  const userRole = user?.role;
  const canModerate =
    userRole === "admin" ||
    userRole === "super_admin" ||
    (!!activeChannel && activeChannel.type !== "direct" && !!activeChannel.createdBy && activeChannel.createdBy === currentUserId);

  const handlers: MessageHandlers = useMemo(
    () => ({
      onReact: async (messageId, emoji) => {
        const before = messagesRef.current.find((m) => m.id === messageId);
        if (before) setMessages((prev) => prev.map((m) => (m.id === messageId ? toggleReactionLocally(m, emoji, currentUserId) : m)));
        try {
          const res = await apiFetch(`/api/chat/messages/${messageId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) });
          if (!res.ok) throw new Error(await errorMessage(res, "Couldn't add reaction"));
          const data = await res.json();
          setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m)));
        } catch (err) {
          if (before) setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: before.reactions } : m)));
          toast.error(err instanceof Error ? err.message : "Couldn't add reaction");
        }
      },
      onOpenThread: (msg) => {
        threadParentCache.current = msg;
        setThreadParentId(msg.id);
      },
      onStartEdit: (msg) => setEditing({ id: msg.id, content: msg.content }),
      onRetry: (id) => {
        const file = pendingFiles.current.get(id);
        if (file) return void sendFile(file, id);
        const text = pendingTexts.current.get(id);
        if (text) void sendText(text, id);
      },
      onDiscard: (id) => {
        pendingFiles.current.delete(id);
        pendingTexts.current.delete(id);
        setMessages((prev) => prev.filter((m) => m.id !== id));
      },
      onCopy: (msg) => {
        navigator.clipboard
          ?.writeText(msg.content)
          .then(() => toast.success("Copied"))
          .catch(() => toast.error("Couldn't copy"));
      },
      onOpenActions: (msg) => setSheetMsg(msg),
      onDelete: (msg) => setConfirmDelete(msg),
      canDelete: (msg) => !msg.deleted && !msg._optimistic && (msg.sender?.id === currentUserId || canModerate),
    }),
    [currentUserId, sendFile, sendText, canModerate]
  );
  const listHandlers = useMemo(() => (isMobile ? handlers : { ...handlers, onOpenActions: undefined }), [handlers, isMobile]);

  const typing = useTyping({
    channelId: activeChannel?.id ?? null,
    currentUserId,
    currentUserName,
    resolveName: (id) => senderCacheRef.current.get(id)?.name || undefined,
  });
  const mainTypers = useMemo(() => typing.typers.filter((t) => !t.threadParentId), [typing.typers]);
  const onMainTyping = useCallback(() => typing.notify(null), [typing.notify]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMainStopTyping = useCallback(() => typing.stop(null), [typing.stop]); // eslint-disable-line react-hooks/exhaustive-deps

  const threadSubscribe = useCallback((fn: ThreadListener) => {
    threadListeners.current.add(fn);
    return () => {
      threadListeners.current.delete(fn);
    };
  }, []);
  const onReplyCountChange = useCallback((parentId: string, delta: number) => {
    setMessages((prev) => prev.map((m) => (m.id === parentId ? { ...m, thread_count: Math.max(0, (m.thread_count ?? 0) + delta) } : m)));
  }, []);

  // -------------------------------------------------------------------------
  // Calls
  // -------------------------------------------------------------------------

  async function startVideoCall() {
    const ch = activeChannelRef.current;
    if (!ch) return;
    try {
      const res = await apiFetch("/api/video/chat-calls", { method: "POST", body: JSON.stringify({ channel_id: ch.id }) });
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to start video call"));
      const data = await res.json();
      setActiveCall({ id: data.id, jitsiRoom: data.jitsi_room, channelId: ch.id, channelName: ch.name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start video call");
    }
  }

  function joinCall() {
    const ch = activeChannelRef.current;
    if (!ch?.active_call?.jitsi_room) return;
    setActiveCall({ id: "", jitsiRoom: ch.active_call.jitsi_room, channelId: ch.id, channelName: ch.name });
  }

  function acceptIncomingCall() {
    if (!incomingCall) return;
    setActiveCall({ ...incomingCall });
    setIncomingCall(null);
  }

  async function endActiveCall() {
    const call = activeCall;
    setActiveCall(null);
    if (call?.id) {
      try {
        await apiFetch(`/api/video/chat-calls/${call.id}/end`, { method: "PUT" });
      } catch {
        /* the call still ends locally either way */
      }
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const participantColorRegistry = useParticipantColorRegistry(activeChannel?.id ?? null);
  const topMessages = useMemo(() => messages.filter((m) => !m.thread_parent_id), [messages]);
  const threadParent = threadParentId
    ? messages.find((m) => m.id === threadParentId) ?? (threadParentCache.current?.id === threadParentId ? threadParentCache.current : null)
    : null;
  const isDirect = activeChannel?.type === "direct";
  const other = activeChannel?.otherUser ?? null;
  const otherOnline = isDirect && isOnline(other?.onlineAt);
  const showList = !isMobile || !activeChannel;
  const showConversation = !isMobile || !!activeChannel;

  const rootStyle: React.CSSProperties | undefined =
    isMobile && vv ? { position: "fixed", left: 0, right: 0, top: vv.offsetTop, height: vv.height } : undefined;

  const subtitle = activeChannel
    ? isDirect
      ? other
        ? formatLastSeen(other.onlineAt)
        : "Direct message"
      : [
          activeChannel.member_count != null ? `${activeChannel.member_count} ${activeChannel.member_count === 1 ? "member" : "members"}` : null,
          activeChannel.description || (activeChannel.type === "course" ? "Course channel" : activeChannel.type === "private" ? "Private channel" : null),
        ]
          .filter(Boolean)
          .join(" · ")
    : "";

  const emptyConversation = activeChannel ? (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
      {isDirect ? (
        <ChatAvatar name={activeChannel.name} userId={other?.id} size="lg" stable />
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary dark:text-gold flex items-center justify-center">
          {activeChannel.type === "private" ? <Lock className="w-7 h-7" /> : <Hash className="w-7 h-7" />}
        </div>
      )}
      <h3 className="font-semibold text-lg mt-4">
        {isDirect ? `Say hello to ${activeChannel.name.split(" ")[0]}` : `Welcome to #${activeChannel.name}`}
      </h3>
      <p className="text-muted-foreground text-sm mt-1 max-w-sm">
        {isDirect
          ? "This is the start of your direct message history."
          : `This is the very beginning of #${activeChannel.name}. Send a message to get the conversation going.`}
      </p>
    </div>
  ) : null;

  return (
    <ParticipantColorProvider value={participantColorRegistry}>
      {incomingCall && <IncomingCallBanner call={incomingCall} onAccept={acceptIncomingCall} onDecline={() => setIncomingCall(null)} />}
      {activeCall && <ActiveCallOverlay call={activeCall} onEnd={endActiveCall} />}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div
        className={`flex overflow-hidden bg-background text-foreground ${isMobile ? "h-[100dvh] overscroll-none" : "h-[100dvh]"}`}
        style={rootStyle}
        data-chat-root
      >
        <DashboardRail role={user?.role} />

        {showList && (
          <aside className="flex-shrink-0 w-full md:w-[300px] lg:w-[320px] min-h-0 border-r border-sidebar-border" aria-label="Conversations">
            <ConversationList
              channels={channels}
              activeId={activeChannel?.id ?? null}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserAvatar={user?.avatarUrl ?? null}
              dashboardHref={dashboardPathForRole(user?.role)}
              onSelect={selectChannel}
              onArchive={archiveChannel}
              onDelete={deleteChannel}
              onCreated={handleChannelCreated}
              onOpenDm={openDmWith}
              loading={channelsLoading}
              showBell={isMobile}
            />
          </aside>
        )}

        {showConversation &&
          (activeChannel ? (
            <main
              className="relative flex flex-1 min-w-0 min-h-0"
              aria-label={`Conversation: ${activeChannel.name}`}
              onDragOver={(e) => {
                if (Array.from(e.dataTransfer.types).includes("Files") && !editing) {
                  e.preventDefault();
                  setDragOver(true);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
              }}
              onDrop={(e) => {
                if (!Array.from(e.dataTransfer.types).includes("Files")) return;
                e.preventDefault();
                setDragOver(false);
                composerRef.current?.addFiles(Array.from(e.dataTransfer.files ?? []));
              }}
            >
              <div className="flex flex-col flex-1 min-w-0 min-h-0">
                <header className="flex items-center gap-2 md:gap-3 px-2 md:px-5 h-14 md:h-16 border-b bg-background/95 backdrop-blur flex-shrink-0">
                  {isMobile && (
                    <button
                      type="button"
                      onClick={closeConversation}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-muted shrink-0"
                      aria-label="Back to conversations"
                      title="Back to conversations"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}
                  {isDirect ? (
                    <ChatAvatar name={activeChannel.name} userId={other?.id} size="md" online={otherOnline} stable />
                  ) : (
                    <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary dark:text-gold flex items-center justify-center shrink-0" aria-hidden="true">
                      {activeChannel.type === "private" ? <Lock className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 ref={headingRef} tabIndex={-1} className="font-semibold text-base leading-tight truncate focus:outline-none">
                      {activeChannel.name}
                    </h2>
                    {subtitle && (
                      <p className={`text-xs leading-tight truncate ${otherOnline ? "text-success font-medium" : "text-muted-foreground"}`}>{subtitle}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 md:gap-2 shrink-0">
                    {activeChannel.active_call ? (
                      <Button size="sm" onClick={joinCall} className="h-10 md:h-9 rounded-full" aria-label="Join call">
                        <Phone className="w-4 h-4 md:mr-1.5" />
                        <span className="hidden md:inline">Join call</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={startVideoCall}
                        className="h-10 w-10 p-0 md:w-auto md:px-3 md:h-9 rounded-full"
                        aria-label="Start video call"
                        title="Start video call"
                      >
                        <Video className="w-4 h-4 md:mr-1.5" />
                        <span className="hidden md:inline">Video call</span>
                      </Button>
                    )}
                    {!isMobile && <NotificationBell />}
                  </div>
                </header>

                <MessageList
                  channelKey={activeChannel.id}
                  messages={topMessages}
                  loading={messagesLoading}
                  hasMore={hasMore}
                  onLoadOlder={loadOlder}
                  unreadAnchorId={unreadAnchorId}
                  currentUserId={currentUserId}
                  bubbles={isMobile}
                  showNames={!isDirect}
                  otherUserLastReadAt={other?.lastReadAt ?? null}
                  isDirect={isDirect}
                  handlers={listHandlers}
                  emptyState={emptyConversation}
                  label={`Messages in ${isDirect ? "" : "#"}${activeChannel.name}`}
                />

                <TypingIndicator typers={mainTypers} />

                <Composer
                  key={activeChannel.id}
                  ref={composerRef}
                  channelKey={activeChannel.id}
                  placeholder={`Message ${isDirect ? activeChannel.name : "#" + activeChannel.name}`}
                  onSend={onComposerSend}
                  editing={editing}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditing(null)}
                  onEditLast={isMobile ? undefined : editLastOwn}
                  onTyping={onMainTyping}
                  onStopTyping={onMainStopTyping}
                />
              </div>

              {threadParent && (
                <ThreadPanel
                  key={threadParent.id}
                  parent={threadParent}
                  channelName={`${isDirect ? "" : "#"}${activeChannel.name}`}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  mobile={isMobile}
                  onClose={() => setThreadParentId(null)}
                  parentHandlers={listHandlers}
                  subscribe={threadSubscribe}
                  onReplyCountChange={onReplyCountChange}
                  onCopy={handlers.onCopy}
                  typers={typing.typers.filter((t) => t.threadParentId === threadParent.id)}
                  onTyping={() => typing.notify(threadParent.id)}
                  onStopTyping={() => typing.stop(threadParent.id)}
                />
              )}

              {dragOver && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 border-2 border-dashed border-gold rounded-lg m-2 pointer-events-none">
                  <div className="text-center">
                    <Upload className="w-8 h-8 mx-auto text-gold" aria-hidden="true" />
                    <p className="mt-2 font-semibold">Drop files to attach</p>
                  </div>
                </div>
              )}
            </main>
          ) : (
            <main className="hidden md:flex flex-1 relative items-center justify-center bg-background">
              {!isMobile && (
                <div className="absolute top-3 right-5">
                  <NotificationBell />
                </div>
              )}
              <div className="text-center space-y-3 px-6">
                <div className="w-20 h-20 rounded-full bg-primary/10 text-primary dark:text-gold flex items-center justify-center mx-auto">
                  <MessageSquare className="w-9 h-9" />
                </div>
                <h2 className="text-xl font-semibold">{channelsLoading ? "Loading conversations…" : "Pick a conversation"}</h2>
                <p className="text-muted-foreground text-sm">Choose a channel or direct message on the left, or start a new one.</p>
              </div>
            </main>
          ))}

        {isMobile && (
          <MessageActionsSheet msg={sheetMsg} currentUserId={currentUserId} handlers={handlers} onClose={() => setSheetMsg(null)} />
        )}

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this message?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDelete && confirmDelete.sender?.id !== currentUserId
                  ? `This removes ${confirmDelete.sender?.name?.split(" ")[0] || "their"}'s message for everyone. `
                  : "This removes the message for everyone. "}
                Replies in its thread stay. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const msg = confirmDelete;
                  setConfirmDelete(null);
                  if (msg) void performDelete(msg);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ParticipantColorProvider>
  );
}
