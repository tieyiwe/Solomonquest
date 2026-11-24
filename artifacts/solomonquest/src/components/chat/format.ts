// Kept in lockstep with the presence ping cadence in ChatPage (ping every
// 5 min, so a still-open tab is at most one missed ping away from this).
export const ONLINE_THRESHOLD_MS = 10 * 60 * 1000;
export const EDIT_WINDOW_MS = 3 * 60 * 1000;
/** Consecutive messages from one sender within this gap render as one group. */
export const GROUP_GAP_MS = 5 * 60 * 1000;

export function isOnline(onlineAt?: string | null): boolean {
  if (!onlineAt) return false;
  return Date.now() - new Date(onlineAt).getTime() < ONLINE_THRESHOLD_MS;
}

export function formatLastSeen(onlineAt?: string | null): string {
  if (!onlineAt) return "Offline";
  const diffMs = Date.now() - new Date(onlineAt).getTime();
  if (diffMs < ONLINE_THRESHOLD_MS) return "Online";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `Active ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Active ${days}d ago`;
  return `Last seen ${new Date(onlineAt).toLocaleDateString()}`;
}

export function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday", "Monday", or "Tue, Nov 4" / "Nov 4, 2024". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Full timestamp for tooltips / screen readers. */
export function fullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact time for the conversation list: "3:42 PM", "Yesterday", "Mon", "Nov 4". */
export function listTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return timeLabel(iso);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtension(name?: string | null): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name ?? "");
  return m ? m[1].toUpperCase() : "FILE";
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  teacher: "Teacher",
  staff: "Staff",
  student: "Student",
  parent: "Parent",
};

export function roleLabel(role?: string | null): string | null {
  if (!role) return null;
  return ROLE_LABELS[role] ?? null;
}

export function isImageAttachment(type?: string | null): boolean {
  return (type ?? "").startsWith("image/");
}
