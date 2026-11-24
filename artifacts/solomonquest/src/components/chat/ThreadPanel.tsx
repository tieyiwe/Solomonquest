import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { MessageRow, type MessageHandlers } from "./MessageRow";
import { MessageActionsSheet } from "./MessageActionsSheet";
import { Composer, type ComposerHandle } from "./Composer";
import { apiFetch, errorMessage, markDeleted, normalizeMessage, uploadAttachment } from "./chatApi";
import { TypingIndicator } from "./TypingIndicator";
import type { Typer } from "./useTyping";
import { GROUP_GAP_MS } from "./format";
import { prefersReducedMotion } from "./MessageList";
import type { ChatMessage } from "./types";

/**
 * Thread events forwarded from the conversation's realtime subscription:
 * "insert" appends a new reply, "edit" applies new content, "delete" turns
 * a reply into its placeholder, "replace" swaps a reply wholesale (rollback).
 */
export type ThreadEventMode = "insert" | "edit" | "delete" | "replace";
export type ThreadListener = (msg: ChatMessage, mode: ThreadEventMode) => void;

export function ThreadPanel({
  parent,
  channelName,
  currentUserId,
  currentUserName,
  mobile,
  onClose,
  parentHandlers,
  subscribe,
  onReplyCountChange,
  onCopy,
  typers = [],
  onTyping,
  onStopTyping,
}: {
  parent: ChatMessage;
  channelName: string;
  currentUserId: string;
  currentUserName: string;
  mobile: boolean;
  onClose: () => void;
  /** Reactions etc. on the parent go through the main list's handlers. */
  parentHandlers: MessageHandlers;
  /** Realtime thread replies forwarded from the conversation's subscription. */
  subscribe: (fn: ThreadListener) => () => void;
  onReplyCountChange: (parentId: string, delta: number) => void;
  onCopy: (msg: ChatMessage) => void;
  /** People typing in this thread. */
  typers?: Typer[];
  onTyping?: () => void;
  onStopTyping?: () => void;
}) {
  const channelId = parent.channel_id;
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [sheetMsg, setSheetMsg] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const filesRef = useRef(new Map<string, File>());
  const textsRef = useRef(new Map<string, string>());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch(`/api/chat/channels/${channelId}/messages/${parent.id}/thread`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => alive && setReplies((data as any[]).map(normalizeMessage)))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [channelId, parent.id]);

  // Focus: the composer on desktop, the heading on phones (no surprise keyboard).
  useEffect(() => {
    if (mobile) headingRef.current?.focus();
    else composerRef.current?.focus();
  }, [mobile, parent.id]);

  useEffect(
    () =>
      subscribe((msg, mode) => {
        if (msg.thread_parent_id !== parent.id) return;
        setReplies((prev) => {
          const has = prev.some((r) => r.id === msg.id);
          if (mode === "insert") return has ? prev : [...prev, msg];
          if (!has) return prev;
          return prev.map((r) => {
            if (r.id !== msg.id) return r;
            if (mode === "delete") return markDeleted(r, msg.deletedAt);
            if (mode === "edit") return r.deleted ? r : { ...r, content: msg.content, isEdited: msg.isEdited, editedAt: msg.editedAt };
            return msg;
          });
        });
        if (mode === "delete") setEditing((e) => (e?.id === msg.id ? null : e));
      }),
    [subscribe, parent.id]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() || loading ? "auto" : "smooth" });
  }, [replies.length, loading]);

  const sendText = useCallback(
    async (content: string, retryId?: string) => {
      const optimisticId = retryId ?? `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      textsRef.current.set(optimisticId, content);
      const optimistic: ChatMessage = {
        id: optimisticId,
        channel_id: channelId,
        content,
        thread_parent_id: parent.id,
        created_at: new Date().toISOString(),
        sender: { id: currentUserId, name: currentUserName },
        _optimistic: true,
      };
      setReplies((prev) => (retryId ? prev.map((r) => (r.id === retryId ? optimistic : r)) : [...prev, optimistic]));
      if (!retryId) onReplyCountChange(parent.id, 1);
      try {
        const res = await apiFetch(`/api/chat/channels/${channelId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content, threadParentId: parent.id }),
        });
        if (!res.ok) throw new Error(await errorMessage(res, "Failed to send reply"));
        const saved = normalizeMessage(await res.json());
        textsRef.current.delete(optimisticId);
        setReplies((prev) =>
          prev.some((r) => r.id === saved.id) ? prev.filter((r) => r.id !== optimisticId) : prev.map((r) => (r.id === optimisticId ? saved : r))
        );
      } catch (err) {
        setReplies((prev) =>
          prev.map((r) => (r.id === optimisticId ? { ...r, _failed: err instanceof Error ? err.message : "Not sent" } : r))
        );
      }
    },
    [channelId, parent.id, currentUserId, currentUserName, onReplyCountChange]
  );

  const sendFile = useCallback(
    async (file: File, retryId?: string) => {
      const optimisticId = retryId ?? `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      filesRef.current.set(optimisticId, file);
      const optimistic: ChatMessage = {
        id: optimisticId,
        channel_id: channelId,
        content: file.name,
        thread_parent_id: parent.id,
        created_at: new Date().toISOString(),
        attachmentName: file.name,
        attachmentType: file.type,
        attachmentSize: file.size,
        sender: { id: currentUserId, name: currentUserName },
        _optimistic: true,
        _uploading: true,
        _progress: 0,
      };
      setReplies((prev) => (retryId ? prev.map((r) => (r.id === retryId ? optimistic : r)) : [...prev, optimistic]));
      if (!retryId) onReplyCountChange(parent.id, 1);
      try {
        const saved = await uploadAttachment(
          channelId,
          file,
          (pct) => setReplies((prev) => prev.map((r) => (r.id === optimisticId ? { ...r, _progress: pct } : r))),
          parent.id
        );
        filesRef.current.delete(optimisticId);
        setReplies((prev) =>
          prev.some((r) => r.id === saved.id) ? prev.filter((r) => r.id !== optimisticId) : prev.map((r) => (r.id === optimisticId ? saved : r))
        );
      } catch (err) {
        setReplies((prev) =>
          prev.map((r) =>
            r.id === optimisticId ? { ...r, _uploading: false, _failed: err instanceof Error ? err.message : "Upload failed" } : r
          )
        );
      }
    },
    [channelId, parent.id, currentUserId, currentUserName, onReplyCountChange]
  );

  const handlers: MessageHandlers = useMemo(
    () => ({
      onReact: async (messageId, emoji) => {
        if (messageId === parent.id) return parentHandlers.onReact(messageId, emoji);
        try {
          const res = await apiFetch(`/api/chat/messages/${messageId}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) });
          if (!res.ok) throw new Error(await errorMessage(res, "Couldn't react"));
          const data = await res.json();
          setReplies((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m)));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't react");
        }
      },
      onStartEdit: (msg) =>
        msg.id === parent.id ? parentHandlers.onStartEdit?.(msg) : setEditing({ id: msg.id, content: msg.content }),
      onRetry: (id) => {
        const file = filesRef.current.get(id);
        if (file) return void sendFile(file, id);
        const text = textsRef.current.get(id);
        if (text) void sendText(text, id);
      },
      onDiscard: (id) => {
        filesRef.current.delete(id);
        textsRef.current.delete(id);
        setReplies((prev) => prev.filter((r) => r.id !== id));
        onReplyCountChange(parent.id, -1);
      },
      onCopy,
      onOpenActions: mobile ? (msg) => setSheetMsg(msg) : undefined,
      onDelete: parentHandlers.onDelete,
      canDelete: parentHandlers.canDelete,
    }),
    [parent.id, parentHandlers, sendFile, sendText, onReplyCountChange, onCopy, mobile]
  );

  async function saveEdit(id: string, content: string): Promise<boolean> {
    try {
      const res = await apiFetch(`/api/chat/messages/${id}`, { method: "PATCH", body: JSON.stringify({ content }) });
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to edit message"));
      const data = await res.json();
      setReplies((prev) => prev.map((m) => (m.id === id ? { ...m, content: data.content, isEdited: data.isEdited, editedAt: data.editedAt } : m)));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to edit message");
      return false;
    }
  }

  const shell = mobile
    ? "absolute inset-0 z-30 flex flex-col bg-background"
    : "w-[360px] lg:w-[400px] shrink-0 border-l flex flex-col bg-background min-h-0";

  return (
    <aside className={shell} aria-label="Thread">
      <header className="flex items-center gap-2 px-2 md:px-4 h-14 border-b shrink-0">
        {mobile && (
          <button type="button" onClick={onClose} className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-muted" aria-label="Back to conversation">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} tabIndex={-1} className="font-semibold text-base leading-tight focus:outline-none">
            Thread
          </h2>
          <p className="text-xs text-muted-foreground truncate">{channelName}</p>
        </div>
        {!mobile && (
          <button type="button" onClick={onClose} className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-muted" aria-label="Close thread">
            <X className="w-4 h-4" />
          </button>
        )}
      </header>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain py-2">
        <MessageRow
          msg={parent}
          currentUserId={currentUserId}
          bubbles={mobile}
          groupStart
          groupEnd
          showNames
          handlers={{ ...parentHandlers, onOpenThread: undefined, onOpenActions: mobile ? (m) => setSheetMsg(m) : undefined }}
          inThread
        />
        <div className="flex items-center gap-3 px-4 my-3 text-xs text-muted-foreground">
          <span>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        {loading ? (
          <div className="flex justify-center py-6 text-muted-foreground" role="status">
            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none mr-2" aria-hidden="true" /> Loading replies…
          </div>
        ) : (
          <ul className="list-none m-0 p-0" aria-live="polite" aria-relevant="additions">
            {replies.map((r, i) => {
              const prev = replies[i - 1];
              const next = replies[i + 1];
              const joinsPrev = !!prev && prev.sender?.id === r.sender?.id && Date.parse(r.created_at) - Date.parse(prev.created_at) < GROUP_GAP_MS;
              const joinsNext = !!next && next.sender?.id === r.sender?.id && Date.parse(next.created_at) - Date.parse(r.created_at) < GROUP_GAP_MS;
              return (
                <li key={r.id}>
                  <MessageRow
                    msg={r}
                    currentUserId={currentUserId}
                    bubbles={mobile}
                    groupStart={!joinsPrev}
                    groupEnd={!joinsNext}
                    showNames
                    handlers={handlers}
                    inThread
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <TypingIndicator typers={typers} />
      <Composer
        key={`thread-${parent.id}`}
        ref={composerRef}
        channelKey={`thread-${parent.id}`}
        compact
        placeholder="Reply in thread…"
        onSend={(text, files) => {
          files.forEach((f) => void sendFile(f));
          if (text) void sendText(text);
        }}
        editing={editing}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditing(null)}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
      />
      {mobile && (
        <MessageActionsSheet msg={sheetMsg} currentUserId={currentUserId} handlers={handlers} onClose={() => setSheetMsg(null)} inThread />
      )}
    </aside>
  );
}
