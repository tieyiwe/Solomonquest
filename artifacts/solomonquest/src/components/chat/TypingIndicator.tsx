import { typingLabel, type Typer } from "./useTyping";

/**
 * "Alex is typing…" pinned just above the composer. It overlays the bottom
 * edge of the message list (zero layout height) so the list doesn't jump as
 * people start and stop typing.
 */
export function TypingIndicator({ typers }: { typers: Typer[] }) {
  const label = typingLabel(typers);
  return (
    <div className="relative h-0 flex-shrink-0">
      <div
        className={`absolute bottom-0 left-0 max-w-[75%] px-4 md:px-5 pb-1 pointer-events-none transition-opacity motion-reduce:transition-none ${
          label ? "opacity-100" : "opacity-0"
        }`}
        role="status"
        aria-live="polite"
        data-typing-indicator
      >
        {label && (
          <span className="inline-flex items-center gap-2 rounded-full bg-background/90 backdrop-blur px-2.5 py-1 text-xs text-muted-foreground shadow-sm border">
            <span className="inline-flex items-end gap-0.5 h-3" aria-hidden="true">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="w-1 h-1 rounded-full bg-current animate-bounce motion-reduce:animate-none"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
            <span className="truncate">{label}</span>
          </span>
        )}
      </div>
    </div>
  );
}
