import { useIsMobile } from "@/hooks/use-mobile";
import { useNotes } from "./NotesContext";
import { StickyNote } from "./StickyNote";

export function StickyNotesLayer() {
  const isMobile = useIsMobile();
  const { notes } = useNotes();

  if (isMobile) return null;

  const stickyNotes = notes.filter((n) => n.is_sticky);
  if (stickyNotes.length === 0) return null;

  return (
    <>
      {stickyNotes.map((note) => (
        <StickyNote key={note.id} note={note} />
      ))}
    </>
  );
}
