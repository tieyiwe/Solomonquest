import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { StickyNote as StickyNoteIcon, X, Plus, Trash2, Share2, Pin, PinOff, Users } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotes } from "./NotesContext";
import { ShareNoteDialog } from "./ShareNoteDialog";
import { NOTE_COLORS, type Note } from "./types";

function NoteCard({ note }: { note: Note }) {
  const { updateNote, deleteNote } = useNotes();
  const isMobile = useIsMobile();
  const [shareOpen, setShareOpen] = useState(false);
  const canEdit = note.permission === "owner" || note.permission === "edit";
  const canManage = note.permission === "owner";

  const handleToggleSticky = () => {
    if (isMobile) {
      toast.info("Sticky notes are only available on tablets and computers. Open this on a larger screen to pin it to your desktop.");
      return;
    }
    updateNote(note.id, { is_sticky: !note.is_sticky });
  };

  return (
    <div className="rounded-lg border p-3 space-y-2" style={{ background: `${note.color}33` }}>
      <div className="flex items-center justify-between gap-2">
        <Input
          value={note.title ?? ""}
          onChange={(e) => canEdit && updateNote(note.id, { title: e.target.value })}
          readOnly={!canEdit}
          placeholder="Untitled note"
          className="h-7 border-none bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0"
        />
        {note.shared && (
          <Badge variant="outline" className="text-[10px] capitalize shrink-0">
            {note.permission}
          </Badge>
        )}
      </div>
      <textarea
        value={note.content}
        onChange={(e) => canEdit && updateNote(note.id, { content: e.target.value })}
        readOnly={!canEdit}
        rows={3}
        placeholder="Write something..."
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1">
          {canManage &&
            NOTE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => updateNote(note.id, { color: c })}
                className={`h-4 w-4 rounded-full border ${note.color === c ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                style={{ background: c }}
              />
            ))}
        </div>
        <div className="flex items-center gap-0.5">
          {canManage && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleToggleSticky} title={note.is_sticky ? "Unpin from screen" : "Pin to screen"}>
              {note.is_sticky ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShareOpen(true)} title="Share">
              <Share2 className="h-3.5 w-3.5" />
              {(note.shareCount ?? 0) > 0 && (
                <span className="ml-0.5 text-[9px] text-muted-foreground">{note.shareCount}</span>
              )}
            </Button>
          )}
          {canManage && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-red-600"
              onClick={() => deleteNote(note.id)}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {canManage && <ShareNoteDialog noteId={note.id} open={shareOpen} onOpenChange={setShareOpen} />}
    </div>
  );
}

export function NotesWidget() {
  const [open, setOpen] = useState(false);
  const { notes, loading, createNote } = useNotes();

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-40 md:bottom-24 right-4 md:right-6 z-40 h-12 w-12 rounded-full bg-amber-400 text-amber-950 shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
          title="Notes"
        >
          <StickyNoteIcon className="h-5 w-5" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-24 z-50 w-full md:w-96 h-[85vh] md:h-[600px] bg-white md:rounded-xl shadow-2xl border flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-400 text-amber-950 shrink-0">
            <div className="flex items-center gap-2">
              <StickyNoteIcon className="h-4 w-4" />
              <span className="font-semibold text-sm">Notes</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-amber-950 hover:bg-amber-500/30 hover:text-amber-950"
                onClick={createNote}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                New
              </Button>
              <button onClick={() => setOpen(false)} className="opacity-80 hover:opacity-100 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading notes...</p>
            ) : notes.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                <StickyNoteIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No notes yet. Click "New" to create one.</p>
                <p className="mt-2 flex items-center justify-center gap-1 text-xs">
                  <Users className="h-3 w-3" /> You can share notes with other staff too.
                </p>
              </div>
            ) : (
              notes.map((note) => <NoteCard key={note.id} note={note} />)
            )}
          </div>
        </div>
      )}
    </>
  );
}
