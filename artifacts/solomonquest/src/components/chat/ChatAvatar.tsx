import { createContext, useContext, useMemo } from "react";
import { SafeImage } from "@/components/common/SafeImage";
import { initials } from "./format";

// Per-person identity colours for initials avatars. These are deliberately
// not theme tokens: they tell people apart, so they must stay distinct from
// each other whatever primary colour a school picks. Speakers get them in
// speaking order within a conversation (first two brown and green), so any
// two people talking are guaranteed to differ.
const CONVERSATION_COLORS = [
  "#92400e", // brown
  "#16a34a", // green
  "#2563eb", // blue
  "#db2777", // pink
  "#7c3aed", // purple
  "#0891b2", // cyan
  "#ea580c", // orange
  "#4f46e5", // indigo
];

function hashColor(name: string): string {
  const safe = name || "?";
  let h = 0;
  for (let i = 0; i < safe.length; i++) h = safe.charCodeAt(i) + ((h << 5) - h);
  return CONVERSATION_COLORS[Math.abs(h) % CONVERSATION_COLORS.length];
}

export interface ParticipantColorRegistry {
  getColor(userId?: string | null, name?: string): string;
}

const ParticipantColorContext = createContext<ParticipantColorRegistry>({
  getColor: (_id, name) => hashColor(name ?? "?"),
});

export const ParticipantColorProvider = ParticipantColorContext.Provider;

/**
 * Recreated whenever the active conversation changes, so each chat restarts
 * its colour assignment rather than carrying colours over from the last one.
 * Colours are claimed the first time a person is seen anywhere (feed, thread).
 */
export function useParticipantColorRegistry(resetKey: string | null): ParticipantColorRegistry {
  const assignments = useMemo(() => new Map<string, string>(), [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(
    () => ({
      getColor(userId?: string | null, name?: string) {
        if (!userId) return hashColor(name ?? "?");
        const existing = assignments.get(userId);
        if (existing) return existing;
        const color = CONVERSATION_COLORS[assignments.size % CONVERSATION_COLORS.length];
        assignments.set(userId, color);
        return color;
      },
    }),
    [assignments]
  );
}

const SIZES = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-11 h-11 text-sm",
} as const;

const DOT = {
  xs: "w-2 h-2",
  sm: "w-2.5 h-2.5",
  md: "w-2.5 h-2.5",
  lg: "w-3 h-3",
} as const;

export function ChatAvatar({
  name,
  userId,
  url,
  size = "md",
  online,
  /** Ring colour around the presence dot, to match the surface behind it. */
  dotRing = "ring-background",
  /** Use a hash colour instead of claiming a conversation colour (lists). */
  stable = false,
}: {
  name: string;
  userId?: string | null;
  url?: string | null;
  size?: keyof typeof SIZES;
  online?: boolean;
  dotRing?: string;
  stable?: boolean;
}) {
  const registry = useContext(ParticipantColorContext);
  const color = stable ? hashColor(userId || name) : registry.getColor(userId, name);
  const fallback = (
    <span
      className={`${SIZES[size]} rounded-full flex items-center justify-center text-white font-semibold select-none`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
  return (
    <span className="relative inline-flex flex-shrink-0">
      <SafeImage
        src={url ?? undefined}
        alt=""
        className={`${SIZES[size]} rounded-full object-cover`}
        fallback={fallback}
      />
      {online && (
        <span
          className={`absolute bottom-0 right-0 ${DOT[size]} rounded-full bg-success ring-2 ${dotRing}`}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
