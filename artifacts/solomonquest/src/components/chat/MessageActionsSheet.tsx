import { useEffect, useState } from "react";
import { Copy, History, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmojiGrid, QUICK_REACTIONS } from "./EmojiPicker";
import { EditHistoryList, canEditMessage, type MessageHandlers } from "./MessageRow";
import { fullTimestamp } from "./format";
import type { ChatMessage } from "./types";

/** Phone action sheet opened by long-pressing a message. */
export function MessageActionsSheet({
  msg,
  currentUserId,
  handlers,
  onClose,
  inThread = false,
}: {
  msg: ChatMessage | null;
  currentUserId: string;
  handlers: MessageHandlers;
  onClose: () => void;
  inThread?: boolean;
}) {
  const [view, setView] = useState<"main" | "emoji" | "history">("main");
  useEffect(() => setView("main"), [msg?.id]);
  const canEdit = msg ? canEditMessage(msg, currentUserId) : false;
  const canDelete = !!(msg && !msg.deleted && handlers.onDelete && handlers.canDelete?.(msg));
  const mineReacted = new Set((msg?.reactions ?? []).filter((r) => r.userIds.includes(currentUserId)).map((r) => r.emoji));

  const item =
    "w-full flex items-center gap-3 h-12 px-4 rounded-xl text-[15px] font-medium hover:bg-muted active:bg-muted text-left";

  function act(fn: () => void) {
    onClose();
    // Let the sheet close (and return focus) before the action moves focus.
    setTimeout(fn, 50);
  }

  return (
    <Sheet open={!!msg} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl px-3 pt-3 max-h-[85dvh] overflow-y-auto">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" />
        <SheetHeader className="text-left px-1 pr-10">
          <SheetTitle className="text-sm font-semibold truncate">
            {msg ? (msg.sender?.id === currentUserId ? "Your message" : msg.sender?.name || "Message") : "Message"}
          </SheetTitle>
          <SheetDescription className="text-xs">{msg ? fullTimestamp(msg.created_at) : ""}</SheetDescription>
        </SheetHeader>
        {msg && view === "main" && (
          <>
            <div className="flex items-center justify-between gap-1 my-3 px-1" role="group" aria-label="React">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => act(() => handlers.onReact(msg.id, e))}
                  aria-label={`React ${e}`}
                  aria-pressed={mineReacted.has(e)}
                  className={`h-11 w-11 rounded-full text-2xl flex items-center justify-center ${
                    mineReacted.has(e) ? "bg-gold/20 ring-1 ring-gold" : "bg-muted"
                  }`}
                >
                  {e}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setView("emoji")}
                aria-label="More reactions"
                className="h-11 w-11 rounded-full bg-muted flex items-center justify-center"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-0.5 pb-1">
              {!inThread && handlers.onOpenThread && (
                <button type="button" className={item} onClick={() => act(() => handlers.onOpenThread!(msg))}>
                  <MessageSquare className="w-5 h-5 text-muted-foreground" aria-hidden="true" /> Reply in thread
                </button>
              )}
              {canEdit && handlers.onStartEdit && (
                <button type="button" className={item} onClick={() => act(() => handlers.onStartEdit!(msg))}>
                  <Pencil className="w-5 h-5 text-muted-foreground" aria-hidden="true" /> Edit
                </button>
              )}
              {!msg.attachmentUrl && (
                <button type="button" className={item} onClick={() => act(() => handlers.onCopy(msg))}>
                  <Copy className="w-5 h-5 text-muted-foreground" aria-hidden="true" /> Copy text
                </button>
              )}
              {msg.isEdited && (
                <button type="button" className={item} onClick={() => setView("history")}>
                  <History className="w-5 h-5 text-muted-foreground" aria-hidden="true" /> Edit history
                </button>
              )}
              {canDelete && (
                <button type="button" className={`${item} text-destructive`} onClick={() => act(() => handlers.onDelete!(msg))}>
                  <Trash2 className="w-5 h-5" aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          </>
        )}
        {msg && view === "emoji" && (
          <div className="my-3 flex justify-center">
            <EmojiGrid onPick={(e) => act(() => handlers.onReact(msg.id, e))} />
          </div>
        )}
        {msg && view === "history" && (
          <div className="my-3 px-1">
            <EditHistoryList messageId={msg.id} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
