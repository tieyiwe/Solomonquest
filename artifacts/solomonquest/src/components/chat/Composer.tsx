import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Pencil, SendHorizontal, Smile, X } from "lucide-react";
import { toast } from "sonner";
import { EmojiPopover } from "./EmojiPicker";
import { fileExtension, formatFileSize } from "./format";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_PENDING = 6;
const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf";

// Unsent text per conversation, so switching chats doesn't lose a draft.
const drafts = new Map<string, string>();

/** Touch-first devices: Enter inserts a newline, the send button sends. */
function isTouchFirst(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;
}

interface Pending {
  id: string;
  file: File;
  preview: string | null;
}

export interface ComposerHandle {
  addFiles: (files: File[]) => void;
  focus: () => void;
}

export interface ComposerProps {
  channelKey: string;
  placeholder: string;
  onSend: (text: string, files: File[]) => void;
  disabled?: boolean;
  /** Smaller variant for the thread panel. */
  compact?: boolean;
  allowAttachments?: boolean;
  editing?: { id: string; content: string } | null;
  onSaveEdit?: (id: string, content: string) => Promise<boolean>;
  onCancelEdit?: () => void;
  /** Desktop: ArrowUp in an empty composer edits your last message. */
  onEditLast?: () => void;
  autoFocus?: boolean;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    channelKey,
    placeholder,
    onSend,
    disabled,
    compact = false,
    allowAttachments = true,
    editing,
    onSaveEdit,
    onCancelEdit,
    onEditLast,
    autoFocus,
  },
  ref
) {
  const [text, setText] = useState(() => drafts.get(channelKey) ?? "");
  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textBeforeEdit = useRef<string>("");
  const wasEditing = useRef(false);

  // Per-conversation draft (the parent remounts the composer per channel via
  // `key`, so the initial state above picks the right draft).
  useEffect(() => {
    if (!editing) {
      if (text) drafts.set(channelKey, text);
      else drafts.delete(channelKey);
    }
  }, [text, channelKey, editing]);

  // Enter/leave edit mode.
  useEffect(() => {
    if (editing) {
      if (!wasEditing.current) textBeforeEdit.current = text;
      wasEditing.current = true;
      setText(editing.content);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    } else if (wasEditing.current) {
      wasEditing.current = false;
      setText(textBeforeEdit.current);
      textBeforeEdit.current = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  // Auto-grow.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const max = compact ? 120 : Math.min(200, Math.round(window.innerHeight * 0.35));
    ta.style.height = Math.min(ta.scrollHeight, max) + "px";
    ta.style.overflowY = ta.scrollHeight > max ? "auto" : "hidden";
  }, [text, compact]);

  const addFiles = useCallback(
    (files: File[]) => {
      if (!allowAttachments || editing) return;
      const ok: Pending[] = [];
      for (const f of files) {
        if (f.size > MAX_ATTACHMENT_BYTES) {
          toast.error(`${f.name} is larger than 25 MB`);
          continue;
        }
        ok.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: f,
          preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
        });
      }
      setPending((prev) => {
        const next = [...prev, ...ok];
        if (next.length > MAX_PENDING) toast.error(`You can attach up to ${MAX_PENDING} files at once`);
        next.slice(MAX_PENDING).forEach((x) => x.preview && URL.revokeObjectURL(x.preview));
        return next.slice(0, MAX_PENDING);
      });
      taRef.current?.focus();
    },
    [allowAttachments, editing]
  );

  useImperativeHandle(ref, () => ({ addFiles, focus: () => taRef.current?.focus() }), [addFiles]);

  function removePending(id: string) {
    setPending((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function submit() {
    if (disabled || saving) return;
    const trimmed = text.trim();
    if (editing) {
      if (!trimmed || trimmed === editing.content) {
        onCancelEdit?.();
        return;
      }
      setSaving(true);
      const ok = await onSaveEdit?.(editing.id, trimmed);
      setSaving(false);
      if (ok) onCancelEdit?.();
      return;
    }
    if (!trimmed && pending.length === 0) return;
    onSend(trimmed, pending.map((p) => p.file));
    pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    setPending([]);
    setText("");
    drafts.delete(channelKey);
    taRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && editing) {
      e.preventDefault();
      onCancelEdit?.();
      return;
    }
    if (e.key === "ArrowUp" && !text && !editing && pending.length === 0 && onEditLast) {
      e.preventDefault();
      onEditLast();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchFirst()) {
      e.preventDefault();
      submit();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!allowAttachments || editing) return;
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  const canSend = !disabled && !saving && (text.trim().length > 0 || pending.length > 0);
  const iconBtn =
    "flex-shrink-0 h-10 w-10 md:h-9 md:w-9 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div
      className={
        compact
          ? "flex-shrink-0 border-t bg-background px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          : "flex-shrink-0 border-t bg-background px-3 md:px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-3"
      }
      onDragOver={(e) => {
        if (!allowAttachments || editing) return;
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!allowAttachments || editing) return;
        e.preventDefault();
        setDragOver(false);
        addFiles(Array.from(e.dataTransfer.files ?? []));
      }}
    >
      {editing && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-gold/15 border border-gold/40 text-sm">
          <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="font-medium">Editing message</span>
          <span className="hidden md:inline text-xs text-muted-foreground">Enter to save · Esc to cancel</span>
          <button
            type="button"
            onClick={onCancelEdit}
            className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-muted"
            aria-label="Cancel editing"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <ul className="flex gap-2 mb-2 overflow-x-auto no-scrollbar pb-1" aria-label="Attachments to send">
          {pending.map((p) => (
            <li key={p.id} className="relative shrink-0 flex items-center gap-2 rounded-xl border bg-card pl-1.5 pr-9 py-1.5 max-w-[220px]">
              {p.preview ? (
                <img src={p.preview} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
              ) : (
                <span className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex flex-col items-center justify-center shrink-0" aria-hidden="true">
                  <FileText className="w-4 h-4" />
                  <span className="text-[8px] font-bold">{fileExtension(p.file.name)}</span>
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-xs font-medium truncate">{p.file.name}</span>
                <span className="block text-[11px] text-muted-foreground">{formatFileSize(p.file.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => removePending(p.id)}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${p.file.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className={`flex items-end gap-1 rounded-3xl border bg-card pl-1 pr-1 py-1 transition-colors focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/20 ${
          dragOver ? "border-gold ring-2 ring-gold/30" : ""
        }`}
      >
        {allowAttachments && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              accept={ACCEPT}
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className={iconBtn}
              onClick={() => fileRef.current?.click()}
              disabled={disabled || !!editing}
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip className="w-5 h-5 md:w-[18px] md:h-[18px]" />
            </button>
          </>
        )}
        <label className="sr-only" htmlFor={`composer-${channelKey}`}>
          {placeholder}
        </label>
        <textarea
          id={`composer-${channelKey}`}
          ref={taRef}
          rows={1}
          className={`flex-1 min-w-0 resize-none bg-transparent text-base md:text-sm leading-6 py-2 ${
            allowAttachments ? "px-1" : "px-3"
          } focus:outline-none placeholder:text-muted-foreground`}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={disabled}
          autoFocus={autoFocus}
          enterKeyHint={isTouchFirst() ? "enter" : "send"}
          aria-describedby={compact ? undefined : `composer-hint-${channelKey}`}
        />
        <EmojiPopover
          onPick={(emoji) => {
            const ta = taRef.current;
            if (ta) {
              const s = ta.selectionStart ?? text.length;
              const en = ta.selectionEnd ?? text.length;
              const next = text.slice(0, s) + emoji + text.slice(en);
              setText(next);
              requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(s + emoji.length, s + emoji.length);
              });
            } else setText((t) => t + emoji);
          }}
          trigger={
            <button type="button" className={iconBtn} aria-label="Insert emoji" title="Insert emoji">
              <Smile className="w-5 h-5 md:w-[18px] md:h-[18px]" />
            </button>
          }
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="flex-shrink-0 h-10 w-10 md:h-9 md:w-9 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={editing ? "Save edit" : "Send message"}
          title={editing ? "Save" : "Send"}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <SendHorizontal className="w-[18px] h-[18px]" />}
        </button>
      </div>
      {!compact && (
        <p id={`composer-hint-${channelKey}`} className="hidden md:block truncate text-[11px] text-muted-foreground mt-1.5 pl-3">
          <kbd className="font-sans font-semibold">Enter</kbd> to send · <kbd className="font-sans font-semibold">Shift+Enter</kbd> new line ·
          paste or drop files to attach{onEditLast ? " · ↑ edits your last message" : ""}
        </p>
      )}
    </div>
  );
});
