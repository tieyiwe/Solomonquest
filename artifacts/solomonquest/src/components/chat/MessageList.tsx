import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { MessageRow, type MessageHandlers } from "./MessageRow";
import { GROUP_GAP_MS, dayKey, dayLabel } from "./format";
import type { ChatMessage } from "./types";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 400;

type Item =
  | { kind: "unread"; key: string }
  | { kind: "msg"; key: string; msg: ChatMessage; groupStart: boolean; groupEnd: boolean };

interface DayGroup {
  key: string;
  label: string;
  items: Item[];
}

// Messages grouped by day: each day is its own block so its sticky date pill
// only sticks while that day is on screen (one pill at a time).
function buildDays(messages: ChatMessage[], unreadAnchorId: string | null): DayGroup[] {
  const days: DayGroup[] = [];
  let items: Item[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
    if (newDay) {
      items = [];
      days.push({ key: `day-${dayKey(m.created_at)}`, label: dayLabel(m.created_at), items });
    }
    const isAnchor = m.id === unreadAnchorId;
    if (isAnchor) items.push({ kind: "unread", key: "unread-divider" });
    const joinsPrev =
      !!prev &&
      !newDay &&
      !isAnchor &&
      prev.sender?.id === m.sender?.id &&
      new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
    const joinsNext =
      !!next &&
      dayKey(next.created_at) === dayKey(m.created_at) &&
      next.id !== unreadAnchorId &&
      next.sender?.id === m.sender?.id &&
      new Date(next.created_at).getTime() - new Date(m.created_at).getTime() < GROUP_GAP_MS;
    items.push({ kind: "msg", key: m.id, msg: m, groupStart: !joinsPrev, groupEnd: !joinsNext });
  }
  return days;
}

export function MessageList({
  channelKey,
  messages,
  loading,
  hasMore,
  onLoadOlder,
  unreadAnchorId,
  currentUserId,
  bubbles,
  showNames,
  otherUserLastReadAt,
  isDirect,
  handlers,
  emptyState,
  label,
}: {
  channelKey: string;
  messages: ChatMessage[];
  loading: boolean;
  hasMore: boolean;
  /** Resolves to how many older messages were prepended. */
  onLoadOlder: () => Promise<number>;
  unreadAnchorId: string | null;
  currentUserId: string;
  bubbles: boolean;
  showNames: boolean;
  otherUserLastReadAt: string | null;
  isDirect: boolean;
  handlers: MessageHandlers;
  emptyState: ReactNode;
  label: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lastClientHeight = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  // Anchor for "load older": the first message on screen and its offset from
  // the top of the list, restored after older messages are prepended (robust
  // to images above it finishing loading in the meantime).
  const prependSnapshot = useRef<{ id: string; offset: number } | null>(null);
  const initialPositioned = useRef<string | null>(null);
  const prevEdges = useRef<{ first?: string; last?: string; len: number }>({ len: 0 });

  const days = useMemo(() => buildDays(messages, unreadAnchorId), [messages, unreadAnchorId]);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
    atBottomRef.current = true;
    setShowJump(false);
    setNewCount(0);
  }, []);

  // Reset per conversation.
  useLayoutEffect(() => {
    atBottomRef.current = true;
    setShowJump(false);
    setNewCount(0);
    prevEdges.current = { len: 0 };
    prependSnapshot.current = null;
  }, [channelKey]);

  // Position the list: first load → unread divider (or bottom); prepend →
  // keep the reader's place; append → follow only if already at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const first = messages[0]?.id;
    const last = messages[messages.length - 1]?.id;
    const prev = prevEdges.current;
    prevEdges.current = { first, last, len: messages.length };

    if (loading || messages.length === 0) return;

    if (initialPositioned.current !== channelKey) {
      initialPositioned.current = channelKey;
      const divider = unreadAnchorId ? el.querySelector<HTMLElement>("[data-unread-divider]") : null;
      if (divider) {
        el.scrollTop = Math.max(0, divider.offsetTop - 48);
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        setShowJump(!atBottomRef.current);
      } else {
        el.scrollTop = el.scrollHeight;
        atBottomRef.current = true;
      }
      return;
    }

    if (prependSnapshot.current && first !== prev.first) {
      const snap = prependSnapshot.current;
      prependSnapshot.current = null;
      const anchor = el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(snap.id)}"]`);
      if (anchor) {
        const offset = anchor.getBoundingClientRect().top - el.getBoundingClientRect().top;
        el.scrollTop += offset - snap.offset;
      }
      return;
    }

    if (last !== prev.last && messages.length >= prev.len) {
      const lastMsg = messages[messages.length - 1];
      const mine = lastMsg?.sender?.id === currentUserId;
      if (atBottomRef.current || mine) {
        scrollToBottom(true);
      } else {
        const appended = prev.last ? messages.length - 1 - messages.findIndex((m) => m.id === prev.last) : 1;
        setNewCount((c) => c + Math.max(1, appended));
        setShowJump(true);
      }
    }
  }, [messages, loading, channelKey, unreadAnchorId, currentUserId, scrollToBottom]);

  // Images and other late layout growth: stay pinned while at the bottom.
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current && !prependSnapshot.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    // Keyboard open / rotate: the list shrinks, keep the latest in view.
    const ro2 = new ResizeObserver(() => {
      lastClientHeight.current = el.clientHeight;
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro2.observe(el);
    return () => {
      ro.disconnect();
      ro2.disconnect();
    };
  }, []);

  const loadOlder = useCallback(async () => {
    const el = scrollRef.current;
    if (!el || loadingOlderRef.current || !hasMore) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const top = el.getBoundingClientRect().top;
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-message-id]"));
    const first = rows.find((r) => r.getBoundingClientRect().bottom > top) ?? rows[0];
    prependSnapshot.current = first
      ? { id: first.dataset.messageId!, offset: first.getBoundingClientRect().top - top }
      : null;
    let added = 0;
    try {
      added = await onLoadOlder();
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
      // Nothing was prepended (error / empty page): drop the snapshot. When
      // something was, the layout effect consumes it on the next commit.
      if (!added) prependSnapshot.current = null;
    }
  }, [hasMore, onLoadOlder]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // The viewport itself changed size (keyboard opening, rotation): that's
    // not the reader scrolling away, so keep following the latest message.
    if (el.clientHeight !== lastClientHeight.current) {
      lastClientHeight.current = el.clientHeight;
      if (atBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        return;
      }
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < NEAR_BOTTOM_PX;
    atBottomRef.current = atBottom;
    setShowJump(distance > 300);
    if (atBottom) setNewCount(0);
    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlderRef.current && !loading) loadOlder();
  }, [hasMore, loadOlder, loading]);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overflow-x-hidden overscroll-contain [overflow-anchor:none] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        tabIndex={0}
        role="region"
        aria-label={label}
        data-chat-scroll
      >
        <div ref={contentRef} className="min-h-full flex flex-col justify-end pb-3">
          {loading && messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-16 text-muted-foreground" role="status">
              <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none mr-2" aria-hidden="true" />
              Loading messages…
            </div>
          ) : messages.length === 0 ? (
            emptyState
          ) : (
            <>
              <div className="flex justify-center py-3 min-h-[44px]">
                {loadingOlder ? (
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status">
                    <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading older messages…
                  </span>
                ) : hasMore ? (
                  <button
                    type="button"
                    onClick={loadOlder}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground h-9 px-3 rounded-full hover:bg-muted"
                  >
                    Load older messages
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">This is the beginning of the conversation</span>
                )}
              </div>
              {days.map((day) => (
                <section key={day.key} aria-label={day.label}>
                  <div className="sticky top-2 z-[5] flex justify-center my-3 pointer-events-none">
                    <h3 className="pointer-events-auto text-[11px] font-semibold tracking-wide px-3 py-1 rounded-full border bg-background/90 backdrop-blur text-muted-foreground shadow-sm">
                      {day.label}
                    </h3>
                  </div>
                  <ul role="list" className="list-none m-0 p-0">
                    {day.items.map((it) =>
                      it.kind === "unread" ? (
                        <li key={it.key} data-unread-divider className="flex items-center gap-3 px-4 my-2" role="separator" aria-label="New messages">
                          <span className="h-px flex-1 bg-gold" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gold-foreground bg-gold px-2 py-0.5 rounded-full">
                            New messages
                          </span>
                          <span className="h-px flex-1 bg-gold" />
                        </li>
                      ) : (
                        <li key={it.key} data-message-id={it.msg.id}>
                          <MessageRow
                            msg={it.msg}
                            currentUserId={currentUserId}
                            bubbles={bubbles}
                            groupStart={it.groupStart}
                            groupEnd={it.groupEnd}
                            showNames={showNames}
                            seen={
                              isDirect && it.msg.sender?.id === currentUserId
                                ? !!(otherUserLastReadAt && new Date(otherUserLastReadAt) >= new Date(it.msg.created_at))
                                : undefined
                            }
                            handlers={handlers}
                          />
                        </li>
                      )
                    )}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute right-4 bottom-4 z-10 inline-flex items-center gap-1.5 h-11 pl-3 pr-4 rounded-full bg-primary text-primary-foreground shadow-lg border border-primary-foreground/10 text-sm font-medium hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={newCount > 0 ? `Jump to latest, ${newCount} new` : "Jump to latest"}
        >
          <ArrowDown className="w-4 h-4" aria-hidden="true" />
          {newCount > 0 ? (
            <span>
              {newCount} new
            </span>
          ) : (
            <span className="hidden sm:inline">Latest</span>
          )}
        </button>
      )}
    </div>
  );
}
