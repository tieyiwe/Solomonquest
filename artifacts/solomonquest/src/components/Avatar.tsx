import { useMemo } from "react";

export interface AvatarProps {
  user?: {
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  onClick?: () => void;
}

const DEFAULT_AVATARS = ["🦁", "🐻", "🦊", "🐼", "🦋", "🌟", "🎯", "🚀"];

const SIZE_PX: Record<NonNullable<AvatarProps["size"]>, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

const SIZE_TEXT: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "text-[10px]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-xl",
};

const SIZE_EMOJI: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "text-xs",
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-4xl",
};

const BG_COLORS = [
  "bg-indigo-500",
  "bg-purple-500",
  "bg-blue-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-red-500",
  "bg-pink-500",
  "bg-teal-500",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % 8;
}

export default function Avatar({ user, size = "md", className = "", onClick }: AvatarProps) {
  const px = SIZE_PX[size];

  const content = useMemo(() => {
    const url = user?.avatar_url;

    if (url?.startsWith("default:")) {
      const idx = parseInt(url.slice(8), 10);
      const safeIdx = isNaN(idx) ? 0 : Math.max(0, Math.min(7, idx));
      const nameSeed = `${user?.first_name ?? ""}${user?.last_name ?? ""}` || String(safeIdx);
      const bg = BG_COLORS[hashName(nameSeed)];
      return (
        <div
          className={`flex items-center justify-center rounded-full ${bg} ${SIZE_EMOJI[size]}`}
          style={{ width: px, height: px, flexShrink: 0 }}
        >
          {DEFAULT_AVATARS[safeIdx]}
        </div>
      );
    }

    if (url && url !== "") {
      return (
        <img
          src={url}
          alt={`${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "Avatar"}
          className="rounded-full object-cover"
          style={{ width: px, height: px, flexShrink: 0 }}
        />
      );
    }

    // Initials fallback
    const first = user?.first_name?.[0]?.toUpperCase() ?? "";
    const last = user?.last_name?.[0]?.toUpperCase() ?? "";
    const initials = (first + last) || "?";
    const nameSeed = `${user?.first_name ?? ""}${user?.last_name ?? ""}`;
    const bg = BG_COLORS[hashName(nameSeed)];

    return (
      <div
        className={`flex items-center justify-center rounded-full ${bg} text-white font-semibold ${SIZE_TEXT[size]}`}
        style={{ width: px, height: px, flexShrink: 0 }}
      >
        {initials}
      </div>
    );
  }, [user, size, px]);

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${className}`}
        style={{ width: px, height: px }}
        aria-label="Avatar"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`inline-flex ${className}`} style={{ width: px, height: px }}>
      {content}
    </div>
  );
}
