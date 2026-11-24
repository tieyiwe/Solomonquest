import { memo, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Copy,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChatAvatar } from "./ChatAvatar";
import { RichText } from "./RichText";
import { AttachmentView } from "./Attachment";
import { EmojiPopover, QUICK_REACTIONS } from "./EmojiPicker";
import { apiFetch } from "./chatApi";
import { EDIT_WINDOW_MS, fullTimestamp, timeLabel } from "./format";
import type { ChatMessage, Reaction } from "./types";

export interface MessageHandlers {
  onReact: (messageId: string, emoji: string) => void;
  onOpenThread?: (msg: ChatMessage) => void;
  onStartEdit?: (msg: ChatMessage) => void;
  onRetry: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  onCopy: (msg: ChatMessage) => void;
  /** Phones: long-press opens the action sheet. */
  onOpenActions?: (msg: ChatMessage) => void;
}

export function canEditMessage(msg: ChatMessage, currentUserId: string): boolean {
  return (
    msg.sender?.id === currentUserId &&
    !msg.attachmentUrl &&
    !msg._optimistic &&
    Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS
  );
}

// ---------------------------------------------------------------------------
// Edited marker — opens the edit history
// ---------------------------------------------------------------------------

export function EditHistoryList({ messageId }: { messageId: string }) {
  const [history, setHistory] = useState<{ content: string; editedAt: string | null }[] | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/chat/messages/${messageId}/edits`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => alive && setHistory(data?.history ?? []))
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, [messageId]);
  if (history === null) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (history.length === 0) return <p className="text-xs text-muted-foreground">No history available.</p>;
  return (
    <ol className="space-y-2">
      {history.map((h, i) => (
        <li key={i} className="text-sm border-b last:border-0 pb-2 last:pb-0">
          <p className="text-[11px] text-muted-foreground mb-0.5">
            {h.editedAt ? `Before ${fullTimestamp(h.editedAt)}` : "Current version"}
          </p>
          <p className="whitespace-pre-wrap break-words">{h.content}</p>
        </li>
      ))}
    </ol>
  );
}

function EditedMarker({ messageId, own }: { messageId: string; own?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`text-[11px] underline decoration-dotted underline-offset-2 ${
            own ? "text-primary-foreground/75 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label="Edited — view edit history"
        >
          (edited)
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-h-72 overflow-y-auto">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Edit history</p>
        {open && <EditHistoryList messageId={messageId} />}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

function ReactionChips({
  reactions,
  currentUserId,
  onToggle,
  showAdd,
  align,
}: {
  reactions: Reaction[];
  currentUserId: string;
  onToggle: (emoji: string) => void;
  showAdd: boolean;
  align: "start" | "end";
}) {
  if (reactions.length === 0) return null;
  return (
    <div className={`flex items-center gap-1 flex-wrap mt-1 ${align === "end" ? "justify-end" : ""}`}>
      {reactions.map((r) => {
        const mine = r.userIds.includes(currentUserId);
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(r.emoji);
            }}
            aria-pressed={mine}
            aria-label={`${r.emoji} ${r.count} ${r.count === 1 ? "reaction" : "reactions"}${mine ? ", including yours" : ""}`}
            className={`h-8 md:h-6 text-xs rounded-full px-2 border flex items-center gap-1 transition-colors ${
              mine
                ? "bg-gold/15 border-gold/60 text-foreground"
                : "bg-card border-border hover:bg-muted text-foreground"
            }`}
          >
            <span aria-hidden="true">{r.emoji}</span>
            <span className="text-[11px] font-medium tabular-nums">{r.count}</span>
          </button>
        );
      })}
      {showAdd && (
        <EmojiPopover
          side="top"
          align="start"
          onPick={onToggle}
          trigger={
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="h-8 md:h-6 w-8 md:w-7 rounded-full border border-dashed text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
              aria-label="Add reaction"
            >
              <SmilePlus className="w-3.5 h-3.5" />
            </button>
          }
        />
      )}
    </div>
  );
}

function ThreadChip({ count, onOpen, align }: { count: number; onOpen: () => void; align: "start" | "end" }) {
  return (
    <div className={`flex ${align === "end" ? "justify-end" : ""}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="mt-1 inline-flex items-center gap-1.5 h-8 md:h-7 px-2 -ml-2 rounded-md text-xs font-semibold text-primary dark:text-gold hover:bg-muted"
      >
        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
        {count} {count === 1 ? "reply" : "replies"}
      </button>
    </div>
  );
}

function FailedNotice({ msg, onRetry, onDiscard, align }: { msg: ChatMessage; onRetry: () => void; onDiscard: () => void; align: "start" | "end" }) {
  return (
    <div className={`flex items-center gap-1 mt-1 text-xs text-destructive ${align === "end" ? "justify-end" : ""}`} role="alert">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{msg._failed || "Not sent"}</span>
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 h-8 px-2 rounded-md font-semibold hover:bg-destructive/10">
        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Retry
      </button>
      <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 h-8 px-2 rounded-md hover:bg-destructive/10" aria-label="Discard unsent message">
        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function Receipt({ seen, className = "" }: { seen: boolean; className?: string }) {
  return (
    <span title={seen ? "Seen" : "Sent"} className={`inline-flex shrink-0 ${className}`}>
      {seen ? <CheckCheck className="w-3.5 h-3.5" aria-label="Seen" /> : <Check className="w-3.5 h-3.5" aria-label="Sent" />}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Desktop hover toolbar
// ---------------------------------------------------------------------------

function HoverToolbar({
  msg,
  canEdit,
  handlers,
}: {
  msg: ChatMessage;
  canEdit: boolean;
  handlers: MessageHandlers;
}) {
  const btn =
    "h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div
      className="absolute right-4 -top-4 z-10 hidden md:flex items-center gap-0.5 rounded-lg border bg-popover text-popover-foreground shadow-sm p-0.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity motion-reduce:transition-none"
      role="toolbar"
      aria-label="Message actions"
    >
      {QUICK_REACTIONS.slice(0, 3).map((e) => (
        <button key={e} type="button" className={`${btn} text-base`} onClick={() => handlers.onReact(msg.id, e)} aria-label={`React ${e}`} title={`React ${e}`}>
          {e}
        </button>
      ))}
      <EmojiPopover
        side="top"
        align="end"
        onPick={(e) => handlers.onReact(msg.id, e)}
        trigger={
          <button type="button" className={btn} aria-label="Add reaction" title="Add reaction">
            <SmilePlus className="w-4 h-4" />
          </button>
        }
      />
      {handlers.onOpenThread && (
        <button type="button" className={btn} onClick={() => handlers.onOpenThread!(msg)} aria-label="Reply in thread" title="Reply in thread">
          <MessageSquare className="w-4 h-4" />
        </button>
      )}
      {canEdit && handlers.onStartEdit && (
        <button type="button" className={btn} onClick={() => handlers.onStartEdit!(msg)} aria-label="Edit message" title="Edit (within 3 minutes)">
          <Pencil className="w-4 h-4" />
        </button>
      )}
      {!msg.attachmentUrl && (
        <button type="button" className={btn} onClick={() => handlers.onCopy(msg)} aria-label="Copy text" title="Copy text">
          <Copy className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Long-press (phones)
// ---------------------------------------------------------------------------

function useLongPress(onLongPress: (() => void) | undefined, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const firedAt = useRef(0);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  if (!onLongPress) return { fired, props: {} };
  return {
    fired,
    props: {
      onTouchStart: (e: React.TouchEvent) => {
        fired.current = false;
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        clear();
        timer.current = setTimeout(() => {
          fired.current = true;
          firedAt.current = Date.now();
          if (navigator.vibrate) navigator.vibrate(10);
          onLongPress();
        }, ms);
      },
      onTouchMove: (e: React.TouchEvent) => {
        const t = e.touches[0];
        if (start.current && (Math.abs(t.clientX - start.current.x) > 8 || Math.abs(t.clientY - start.current.y) > 8)) clear();
      },
      onTouchEnd: clear,
      onTouchCancel: clear,
      onContextMenu: (e: React.MouseEvent) => {
        // Long-press on touch also fires contextmenu; use it as the trigger
        // and suppress the native callout.
        e.preventDefault();
        clear();
        // Skip if the long-press timer already opened the sheet for this press.
        if (fired.current && Date.now() - firedAt.current < 800) return;
        fired.current = true;
        firedAt.current = Date.now();
        onLongPress();
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

export interface MessageRowProps {
  msg: ChatMessage;
  currentUserId: string;
  /** Bubble layout (phones) instead of the compact list layout (desktop). */
  bubbles: boolean;
  /** First message of a run from the same sender. */
  groupStart: boolean;
  /** Last message of a run from the same sender. */
  groupEnd: boolean;
  /** Show sender names on bubbles (group conversations). */
  showNames: boolean;
  /** DM read receipt state for own messages; undefined = don't show. */
  seen?: boolean;
  handlers: MessageHandlers;
  /** Inside the thread panel: no thread chip / reply action. */
  inThread?: boolean;
}

export const MessageRow = memo(function MessageRow({
  msg,
  currentUserId,
  bubbles,
  groupStart,
  groupEnd,
  showNames,
  seen,
  handlers,
  inThread = false,
}: MessageRowProps) {
  const isOwn = msg.sender?.id === currentUserId;
  const pending = !!msg._optimistic && !msg._failed;
  const canEdit = canEditMessage(msg, currentUserId);
  const threadCount = msg.thread_count ?? 0;
  const reactions = msg.reactions ?? [];
  const confirmed = !msg._optimistic;
  const [showMeta, setShowMeta] = useState(false);
  const longPress = useLongPress(confirmed && bubbles ? () => handlers.onOpenActions?.(msg) : undefined);
  const name = msg.sender?.name || "Unknown";
  const hasText = !msg.attachmentUrl && !msg._uploading;
  const time = timeLabel(msg.created_at);
  const ts = fullTimestamp(msg.created_at);
  const failed = !!msg._failed;

  const content = hasText ? (
    <p className="text-[15px] md:text-sm whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
      <RichText text={msg.content} />
    </p>
  ) : (
    <AttachmentView msg={msg} own={bubbles && isOwn && !isImageMsg(msg)} />
  );

  // ---------------- phones: chat bubbles ----------------
  if (bubbles) {
    const align = isOwn ? "end" : "start";
    const bubbleCls = isOwn
      ? "bg-primary text-primary-foreground"
      : "bg-card text-card-foreground border";
    // Joined corners inside a run, a small "tail" corner on the last bubble.
    const corner = isOwn
      ? `${groupStart ? "" : "rounded-tr-md"} ${groupEnd ? "rounded-br-sm" : "rounded-br-md"}`
      : `${groupStart ? "" : "rounded-tl-md"} ${groupEnd ? "rounded-bl-sm" : "rounded-bl-md"}`;
    const imageOnly = isImageMsg(msg);
    return (
      <div className={`flex gap-2 px-3 ${isOwn ? "justify-end" : "justify-start"} ${groupStart ? "mt-3" : "mt-0.5"}`}>
        {!isOwn && (
          <div className="w-8 shrink-0 flex items-end">
            {groupEnd && <ChatAvatar name={name} userId={msg.sender?.id} url={msg.sender?.avatar_url} size="sm" />}
          </div>
        )}
        <div className={`min-w-0 max-w-[82%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
          {!isOwn && showNames && groupStart && (
            <span className="text-xs font-semibold text-muted-foreground px-3 mb-0.5 truncate max-w-full">{name}</span>
          )}
          <div
            {...longPress.props}
            role="button"
            tabIndex={0}
            aria-haspopup={confirmed ? "dialog" : undefined}
            aria-label={`${isOwn ? "You" : name}, ${ts}${msg.isEdited ? ", edited" : ""}. ${hasText ? msg.content : msg.attachmentName ?? "attachment"}`}
            onClick={(e) => {
              if (longPress.fired.current) return;
              if ((e.target as HTMLElement).closest("a,button")) return;
              setShowMeta((v) => !v);
            }}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && confirmed) {
                e.preventDefault();
                handlers.onOpenActions?.(msg);
              }
            }}
            className={`relative max-w-full rounded-2xl ${corner} ${imageOnly ? "p-1" : "px-3 py-2"} ${bubbleCls} ${
              pending ? "opacity-70" : ""
            } ${failed ? "ring-1 ring-destructive" : ""} select-none [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            {content}
            <span
              className={`flex items-center justify-end gap-1 mt-0.5 text-[11px] leading-none ${
                imageOnly ? "px-1.5 pb-0.5" : ""
              } ${isOwn ? "text-primary-foreground/75" : "text-muted-foreground"}`}
            >
              {msg.isEdited && confirmed && <EditedMarker messageId={msg.id} own={isOwn} />}
              <time dateTime={msg.created_at}>{time}</time>
              {pending && <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" aria-label="Sending" />}
              {seen !== undefined && confirmed && <Receipt seen={seen} />}
            </span>
          </div>
          {showMeta && (
            <span className="text-[11px] text-muted-foreground px-2 mt-0.5">{ts}</span>
          )}
          {failed && (
            <FailedNotice msg={msg} onRetry={() => handlers.onRetry(msg.id)} onDiscard={() => handlers.onDiscard(msg.id)} align={align} />
          )}
          {confirmed && (
            <ReactionChips reactions={reactions} currentUserId={currentUserId} onToggle={(e) => handlers.onReact(msg.id, e)} showAdd={false} align={align} />
          )}
          {!inThread && confirmed && threadCount > 0 && handlers.onOpenThread && (
            <ThreadChip count={threadCount} onOpen={() => handlers.onOpenThread!(msg)} align={align} />
          )}
        </div>
      </div>
    );
  }

  // ---------------- desktop: compact list ----------------
  return (
    <div
      className={`group relative flex gap-3 px-4 md:px-5 py-0.5 hover:bg-muted/50 focus-within:bg-muted/50 transition-colors motion-reduce:transition-none ${
        groupStart ? "mt-2 pt-1.5" : ""
      }`}
    >
      <div className="w-9 shrink-0">
        {groupStart ? (
          <div className="pt-0.5">
            <ChatAvatar name={name} userId={msg.sender?.id} url={msg.sender?.avatar_url} size="md" />
          </div>
        ) : (
          <time
            dateTime={msg.created_at}
            title={ts}
            className="block text-[10px] leading-6 text-muted-foreground text-right opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 select-none tabular-nums"
          >
            {time}
          </time>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {groupStart && (
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-semibold text-sm truncate">{isOwn ? `${name}` : name}</span>
            <time dateTime={msg.created_at} title={ts} className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {time}
            </time>
          </div>
        )}
        <div className={`flex items-end gap-1.5 min-w-0 ${pending ? "opacity-60" : ""}`}>
          <div className="min-w-0">{content}</div>
          {msg.isEdited && confirmed && (
            <span className="shrink-0 mb-0.5">
              <EditedMarker messageId={msg.id} />
            </span>
          )}
          {pending && <Loader2 className="w-3.5 h-3.5 mb-1 shrink-0 animate-spin motion-reduce:animate-none text-muted-foreground" aria-label="Sending" />}
          {seen !== undefined && confirmed && (
            <Receipt seen={seen} className={`mb-1 ${seen ? "text-primary dark:text-gold" : "text-muted-foreground"}`} />
          )}
        </div>
        {failed && (
          <FailedNotice msg={msg} onRetry={() => handlers.onRetry(msg.id)} onDiscard={() => handlers.onDiscard(msg.id)} align="start" />
        )}
        {confirmed && (
          <ReactionChips reactions={reactions} currentUserId={currentUserId} onToggle={(e) => handlers.onReact(msg.id, e)} showAdd align="start" />
        )}
        {!inThread && confirmed && threadCount > 0 && handlers.onOpenThread && (
          <ThreadChip count={threadCount} onOpen={() => handlers.onOpenThread!(msg)} align="start" />
        )}
      </div>
      {confirmed && <HoverToolbar msg={msg} canEdit={canEdit} handlers={inThread ? { ...handlers, onOpenThread: undefined } : handlers} />}
    </div>
  );
});

function isImageMsg(msg: ChatMessage): boolean {
  return !!(msg.attachmentUrl || msg._uploading) && (msg.attachmentType ?? "").startsWith("image/");
}
