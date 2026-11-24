import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * "Typing…" over a PRIVATE Supabase Realtime broadcast channel,
 * `typing:<channelId>`. Joining and sending are authorised by the
 * realtime.messages RLS policies in chat-typing.sql (members of that chat
 * channel only), so a channel id alone is not enough to watch who types.
 *
 * If the join is refused (policies not installed, Realtime Authorization
 * unavailable) the indicator turns itself off for the rest of the page's
 * life — silently: no errors, no toasts.
 */

export interface Typer {
  userId: string;
  name: string;
  /** Thread the person is typing in; null = the main conversation. */
  threadParentId: string | null;
}

const SEND_EVERY_MS = 3000;
const EXPIRE_MS = 6000;
const EVENT = "typing";

// Set after a refused join: the same policies guard every conversation, so
// don't keep retrying (and re-failing) on each one.
let unavailable = false;

export function useTyping({
  channelId,
  currentUserId,
  currentUserName,
  resolveName,
}: {
  channelId: string | null;
  currentUserId: string;
  currentUserName: string;
  /** Prefer a locally known name for a user id over the one in the payload. */
  resolveName?: (userId: string) => string | undefined;
}) {
  const [typers, setTypers] = useState<Typer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const readyRef = useRef(false);
  const lastSent = useRef<{ at: number; thread: string | null }>({ at: 0, thread: null });
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const resolveRef = useRef(resolveName);
  resolveRef.current = resolveName;
  const meRef = useRef({ id: currentUserId, name: currentUserName });
  meRef.current = { id: currentUserId, name: currentUserName };

  const drop = useCallback((key: string) => {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.delete(key);
    setTypers((prev) => prev.filter((x) => `${x.userId}|${x.threadParentId ?? ""}` !== key));
  }, []);

  useEffect(() => {
    readyRef.current = false;
    lastSent.current = { at: 0, thread: null };
    setTypers([]);
    if (!channelId || !currentUserId || unavailable) return;

    let closed = false;
    let channel: RealtimeChannel;
    try {
      channel = supabase.channel(`typing:${channelId}`, { config: { private: true, broadcast: { self: false } } });
    } catch {
      return;
    }
    channelRef.current = channel;

    channel.on("broadcast", { event: EVENT }, (msg: { payload?: unknown }) => {
      const p = (msg?.payload ?? {}) as { userId?: unknown; name?: unknown; threadParentId?: unknown; stop?: unknown };
      if (typeof p.userId !== "string" || !p.userId || p.userId === meRef.current.id) return;
      const thread = typeof p.threadParentId === "string" && p.threadParentId ? p.threadParentId : null;
      const key = `${p.userId}|${thread ?? ""}`;
      if (p.stop) {
        drop(key);
        return;
      }
      const name =
        resolveRef.current?.(p.userId) ||
        (typeof p.name === "string" ? p.name.trim().slice(0, 60) : "") ||
        "Someone";
      const userId = p.userId;
      setTypers((prev) =>
        prev.some((x) => x.userId === userId && x.threadParentId === thread) ? prev : [...prev, { userId, name, threadParentId: thread }]
      );
      const old = timers.current.get(key);
      if (old) clearTimeout(old);
      timers.current.set(key, setTimeout(() => drop(key), EXPIRE_MS));
    });

    channel.subscribe((status) => {
      if (closed) return;
      if (status === "SUBSCRIBED") {
        readyRef.current = true;
      } else if (status === "CHANNEL_ERROR") {
        // Refused (no policy / not authorised) or broken: switch off quietly.
        // Removing the channel also stops realtime-js from re-joining it.
        unavailable = true;
        readyRef.current = false;
        closed = true;
        channelRef.current = null;
        supabase.removeChannel(channel).catch(() => {});
      } else if (status === "TIMED_OUT" || status === "CLOSED") {
        readyRef.current = false;
      }
    });

    const timerMap = timers.current;
    return () => {
      closed = true;
      readyRef.current = false;
      if (channelRef.current === channel) channelRef.current = null;
      timerMap.forEach((t) => clearTimeout(t));
      timerMap.clear();
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [channelId, currentUserId, drop]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ch = channelRef.current;
    if (!ch || !readyRef.current) return;
    ch.send({ type: "broadcast", event: EVENT, payload }).catch(() => {});
  }, []);

  /** Call on every keystroke with text present; throttled to one send / 3s. */
  const notify = useCallback(
    (threadParentId: string | null = null) => {
      const now = Date.now();
      const last = lastSent.current;
      if (last.thread === threadParentId && now - last.at < SEND_EVERY_MS) return;
      lastSent.current = { at: now, thread: threadParentId };
      send({ userId: meRef.current.id, name: meRef.current.name, threadParentId });
    },
    [send]
  );

  /** Call on send, blur, or when the input becomes empty. */
  const stop = useCallback(
    (threadParentId: string | null = null) => {
      const last = lastSent.current;
      if (!last.at || last.thread !== threadParentId) return;
      const recent = Date.now() - last.at < EXPIRE_MS;
      lastSent.current = { at: 0, thread: null };
      if (recent) send({ userId: meRef.current.id, threadParentId, stop: true });
    },
    [send]
  );

  return { typers, notify, stop };
}

/** "Alex is typing…", "Alex and Sam are typing…", "Alex and 2 others are typing…" */
export function typingLabel(typers: Typer[]): string {
  const first = (t: Typer) => t.name.split(" ")[0] || t.name;
  if (typers.length === 0) return "";
  if (typers.length === 1) return `${first(typers[0])} is typing…`;
  if (typers.length === 2) return `${first(typers[0])} and ${first(typers[1])} are typing…`;
  return `${first(typers[0])} and ${typers.length - 1} others are typing…`;
}
