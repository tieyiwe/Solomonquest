import { useCallback, useRef, useState } from "react";
import { X, Pin } from "lucide-react";
import { useNotes } from "./NotesContext";
import type { Note } from "./types";

const MIN_WIDTH = 180;
const MIN_HEIGHT = 160;

export function StickyNote({ note }: { note: Note }) {
  const { updateNote } = useNotes();
  const [local, setLocal] = useState({ x: note.pos_x, y: note.pos_y, w: note.width, h: note.height });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const canEdit = note.permission === "owner" || note.permission === "edit";
  const canMove = note.permission === "owner";

  const commitPosition = useCallback((x: number, y: number) => {
    updateNote(note.id, { pos_x: x, pos_y: y });
  }, [note.id, updateNote]);

  const commitSize = useCallback((w: number, h: number) => {
    updateNote(note.id, { width: w, height: h });
  }, [note.id, updateNote]);

  const handleDragStart = (e: React.PointerEvent) => {
    if (!canMove) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: local.x, origY: local.y };
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setLocal((prev) => ({
      ...prev,
      x: Math.max(0, dragState.current!.origX + dx),
      y: Math.max(0, dragState.current!.origY + dy),
    }));
  };

  const handleDragEnd = () => {
    if (!dragState.current) return;
    dragState.current = null;
    commitPosition(local.x, local.y);
  };

  const handleResizeStart = (e: React.PointerEvent) => {
    if (!canMove) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: local.w, origH: local.h };
  };

  const handleResizeMove = (e: React.PointerEvent) => {
    if (!resizeState.current) return;
    e.stopPropagation();
    const dx = e.clientX - resizeState.current.startX;
    const dy = e.clientY - resizeState.current.startY;
    setLocal((prev) => ({
      ...prev,
      w: Math.max(MIN_WIDTH, resizeState.current!.origW + dx),
      h: Math.max(MIN_HEIGHT, resizeState.current!.origH + dy),
    }));
  };

  const handleResizeEnd = (e: React.PointerEvent) => {
    if (!resizeState.current) return;
    e.stopPropagation();
    resizeState.current = null;
    commitSize(local.w, local.h);
  };

  return (
    <div
      className="fixed z-30 rounded-lg shadow-xl border border-black/10 flex flex-col overflow-hidden"
      style={{ left: local.x, top: local.y, width: local.w, height: local.h, background: note.color }}
    >
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        className={`flex items-center justify-between px-2.5 py-1.5 shrink-0 ${canMove ? "cursor-move" : ""}`}
        style={{ background: "rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 truncate">
          <Pin className="h-3 w-3 shrink-0" />
          <span className="truncate">{note.title || "Sticky note"}</span>
        </div>
        {note.permission === "owner" && (
          <button
            onClick={() => updateNote(note.id, { is_sticky: false })}
            className="text-gray-600 hover:text-gray-900 shrink-0"
            title="Unpin from screen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <textarea
        value={note.content}
        onChange={(e) => canEdit && updateNote(note.id, { content: e.target.value })}
        readOnly={!canEdit}
        placeholder="Write something..."
        className="flex-1 resize-none bg-transparent p-2.5 text-sm outline-none placeholder:text-gray-500/70"
      />

      {canMove && (
        <div
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          className="absolute bottom-0.5 right-0.5 h-4 w-4 cursor-nwse-resize opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(135deg, transparent 0%, transparent 40%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.4) 55%, transparent 55%, transparent 70%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.4) 85%, transparent 85%)",
          }}
        />
      )}
    </div>
  );
}
