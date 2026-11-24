import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const EMOJI_OPTIONS = [
  "😀", "😂", "😊", "😍", "🤔", "😢", "😮", "😡",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👋",
  "❤️", "🔥", "🎉", "✅", "⭐", "💯", "🚀", "😅",
  "😴", "🤗", "🤯", "🥳", "😎", "🙄", "😬", "🤦",
];

export function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5" role="group" aria-label="Emoji">
      {EMOJI_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="h-9 w-9 text-xl rounded-md hover:bg-muted focus-visible:bg-muted focus-visible:outline-none flex items-center justify-center"
          onClick={() => onPick(emoji)}
          aria-label={`Emoji ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** A popover emoji grid around any trigger button. */
export function EmojiPopover({
  trigger,
  onPick,
  side = "top",
  align = "end",
}: {
  trigger: ReactNode;
  onPick: (emoji: string) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-auto p-1.5">
        <EmojiGrid
          onPick={(e) => {
            onPick(e);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
