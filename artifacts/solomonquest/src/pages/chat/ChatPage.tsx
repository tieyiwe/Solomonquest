import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Send,
  Hash,
  Lock,
  User,
  Phone,
  Search,
  Plus,
  X,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Users,
  BookOpen,
  Settings,
  CheckSquare,
  FolderOpen,
  BarChart2,
  Bell,
  AlertTriangle,
  HelpCircle,
  FileText,
  ClipboardList,
  CalendarCheck,
  AlarmClock,
  Scroll,
  GraduationCap,
  MoreVertical,
  Archive,
  ArchiveRestore,
  Trash2,
  ArrowLeft,
  Smile,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Channel {
  id: string;
  name: string;
  type: "public" | "course" | "private" | "direct";
  description?: string;
  unread_count?: number;
  member_count?: number;
  active_call?: { jitsi_room: string } | null;
  createdAt?: string | null;
  isArchived?: boolean;
}

interface ChatMessage {
  id: string;
  channel_id: string;
  content: string;
  thread_parent_id?: string | null;
  thread_count?: number;
  created_at: string;
  sender: {
    id: string;
    name: string;
    avatar_url?: string | null;
    online_at?: string | null;
  };
  _optimistic?: boolean;
}

interface UserResult {
  id: string;
  name: string;
  unique_student_id: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const token = await getToken();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

const AVATAR_COLORS = [
  "#ef4444","#f97316","#f59e0b","#84cc16","#22c55e",
  "#14b8a6","#06b6d4","#3b82f6","#8b5cf6","#ec4899",
];

function nameColor(name: string): string {
  const safe = name || "?";
  let h = 0;
  for (let i = 0; i < safe.length; i++) h = safe.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Colors assigned by speaking order within a single conversation, so any two
// people talking are guaranteed visually distinct rather than left to a name
// hash that could collide. First two speakers are brown and green; anyone
// past that gets the next color down the list.
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

const ParticipantColorContext = createContext<Map<string, string>>(new Map());

function useParticipantColor(userId?: string | null, name?: string): string {
  const colorMap = useContext(ParticipantColorContext);
  if (userId && colorMap.has(userId)) return colorMap.get(userId)!;
  return nameColor(name ?? "?");
}

function initials(name: string): string {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

function isOnline(onlineAt?: string | null): boolean {
  if (!onlineAt) return false;
  return Date.now() - new Date(onlineAt).getTime() < 2 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({
  name,
  userId,
  size = "md",
}: {
  name: string;
  userId?: string | null;
  size?: "xs" | "sm" | "md";
}) {
  const color = useParticipantColor(userId, name);
  const sz =
    size === "xs"
      ? "w-6 h-6 text-[10px]"
      : size === "sm"
      ? "w-7 h-7 text-xs"
      : "w-9 h-9 text-sm";
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel icon
// ---------------------------------------------------------------------------

function ChannelIcon({ type, className = "w-3.5 h-3.5" }: { type: Channel["type"]; className?: string }) {
  if (type === "private") return <Lock className={className} />;
  if (type === "direct") return <User className={className} />;
  return <Hash className={className} />;
}

// ---------------------------------------------------------------------------
// Sidebar channel button
// ---------------------------------------------------------------------------

function SidebarChannel({
  ch,
  active,
  onClick,
  onArchive,
  onDelete,
}: {
  ch: Channel;
  active: boolean;
  onClick: () => void;
  onArchive?: (ch: Channel, archived: boolean) => void;
  onDelete?: (ch: Channel) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      className={`group relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-[#b9bbbe] hover:bg-white/5 hover:text-white"
      }`}
    >
      <button onClick={onClick} className="flex-1 flex items-center gap-2 min-w-0 text-left">
        <ChannelIcon type={ch.type} className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
        <span className="flex-1 truncate text-left">{ch.name}</span>
      </button>
      {(ch.unread_count ?? 0) > 0 && (
        <span className="text-xs font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight shrink-0">
          {ch.unread_count}
        </span>
      )}
      {(onArchive || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-opacity"
              title="Channel options"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {onArchive && (
              <DropdownMenuItem onClick={() => onArchive(ch, !ch.isArchived)}>
                {ch.isArchived ? (
                  <>
                    <ArchiveRestore className="w-3.5 h-3.5 mr-2" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5 mr-2" />
                    Archive
                  </>
                )}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onDelete && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{ch.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the conversation and all its messages for everyone in it.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onDelete(ch)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// People Search — visible search bar at the top of the chat sidebar
// ---------------------------------------------------------------------------

interface PersonResult {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  internal_email?: string | null;
  role?: string | null;
  avatar_url?: string | null;
  unique_student_id?: string | null;
}

function PeopleSearch({
  onOpenDm,
  directChannels,
}: {
  onOpenDm: (userId: string, name: string) => void;
  directChannels: Channel[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runSearch(q: string) {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/users/search?query=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    // Empty query still hits the API — it returns the whole school directory,
    // alphabetically, so people can browse before typing anything.
    timerRef.current = setTimeout(() => runSearch(query.trim()), query.trim() ? 300 : 0);
  }, [query, open]);

  function fullName(p: PersonResult) {
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.internal_email || "Unknown";
  }

  return (
    <div className="px-2 pb-2 relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#72767d]" />
        <input
          className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-white/8 border border-white/10 text-white placeholder:text-[#72767d] focus:outline-none focus:ring-1 focus:ring-white/20"
          placeholder="Find people..."
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="absolute right-2 top-2 text-[#72767d] hover:text-white"
            onClick={() => { setQuery(""); setResults([]); }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (results.length > 0 || loading) && (
        <div className="absolute left-2 right-2 mt-1 rounded-md border border-white/10 overflow-hidden z-50" style={{ backgroundColor: "#2b2d42" }}>
          {loading && (
            <p className="px-3 py-2 text-xs text-[#72767d]">Searching…</p>
          )}
          {results.map((p) => {
            const name = fullName(p);
            const existing = directChannels.find((c) => c.name === name);
            const chatDate = existing?.createdAt
              ? new Date(existing.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
              : null;
            return (
              <button
                key={p.id}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors text-left"
                onClick={() => {
                  onOpenDm(p.id, name);
                  setQuery("");
                  setResults([]);
                }}
              >
                <Avatar name={name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium truncate">{name}</p>
                  {chatDate ? (
                    <p className="text-[#72767d] text-xs truncate">Chatted since {chatDate}</p>
                  ) : p.internal_email ? (
                    <p className="text-[#72767d] text-xs truncate">{p.internal_email}</p>
                  ) : null}
                </div>
                {p.role && (
                  <span className="text-[10px] text-[#72767d] capitalize shrink-0">
                    {p.role.replace("_", " ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Channel Dialog
// ---------------------------------------------------------------------------

function NewChannelDialog({
  onCreated,
  onOpenDm,
}: {
  onCreated: (ch: Channel) => void;
  onOpenDm: (userId: string, name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"private" | "direct">("private");
  const [channelName, setChannelName] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchUsers = useCallback((q: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/users/search?query=${encodeURIComponent(q)}`);
        if (res.ok) {
          const raw: PersonResult[] = await res.json();
          setUserResults(
            raw.map((p) => ({
              id: p.id,
              name:
                [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                p.internal_email ||
                "Unknown",
              unique_student_id: p.unique_student_id ?? "",
            }))
          );
        }
      } catch {
        /* ignore */
      }
    }, 300);
  }, []);

  useEffect(() => {
    searchUsers(userQuery);
  }, [userQuery, searchUsers]);

  function toggleUser(u: UserResult) {
    if (mode === "direct") {
      // A direct message is always exactly one other person — picking someone
      // new replaces the previous pick instead of building a group.
      setSelectedUsers((prev) => (prev[0]?.id === u.id ? [] : [u]));
      return;
    }
    setSelectedUsers((prev) =>
      prev.find((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]
    );
  }

  async function handleCreate() {
    if (selectedUsers.length === 0) {
      toast.error("Select a user");
      return;
    }

    if (mode === "direct") {
      // DMs don't need a channel name/dialog round trip — reuse the same
      // dedup-aware logic the sidebar's quick "Find people" search uses.
      setLoading(true);
      const ok = await onOpenDm(selectedUsers[0].id, selectedUsers[0].name);
      setLoading(false);
      if (ok) {
        setOpen(false);
        setSelectedUsers([]);
        setUserQuery("");
      }
      return;
    }

    const name = channelName.trim();
    if (!name) {
      toast.error("Enter a channel name");
      return;
    }
    // A channel is a group conversation — you plus at least 2 others (3
    // total). Anything smaller is just a direct message, which has its own
    // frictionless flow above and doesn't need a name.
    if (selectedUsers.length < 2) {
      toast.error("A channel needs at least 3 people — pick 2 more, or use Direct Message for just one person");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/chat/channels", {
        method: "POST",
        body: JSON.stringify({ name, type: mode, memberIds: selectedUsers.map((u) => u.id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      onCreated(body as Channel);
      setOpen(false);
      setChannelName("");
      setSelectedUsers([]);
      setUserQuery("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-[#b9bbbe] hover:text-white hover:bg-white/10 transition-colors"
          title="Create channel"
        >
          <Plus className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "direct" ? "New Direct Message" : "New Channel"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex gap-2">
            <Button
              variant={mode === "private" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("private")}
            >
              <Lock className="w-3.5 h-3.5 mr-1" /> Private Channel
            </Button>
            <Button
              variant={mode === "direct" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("direct")}
            >
              <User className="w-3.5 h-3.5 mr-1" /> Direct Message
            </Button>
          </div>

          {mode === "private" && (
            <Input
              placeholder="Channel name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search users..."
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />
          </div>

          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedUsers.map((u) => (
                <span
                  key={u.id}
                  className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full"
                >
                  {u.name}
                  <button onClick={() => toggleUser(u)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {userResults.length > 0 && (
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {userResults.map((u) => {
                const sel = !!selectedUsers.find((x) => x.id === u.id);
                return (
                  <button
                    key={u.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 ${
                      sel ? "bg-primary/10" : ""
                    }`}
                    onClick={() => toggleUser(u)}
                  >
                    <Avatar name={u.name} size="sm" />
                    <span className="font-medium">{u.name}</span>
                    <span className="text-muted-foreground text-xs">{u.unique_student_id}</span>
                  </button>
                );
              })}
            </div>
          )}

          <Button className="w-full" onClick={handleCreate} disabled={loading}>
            {loading
              ? mode === "direct"
                ? "Opening..."
                : "Creating..."
              : mode === "direct"
              ? "Message"
              : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inline thread preview (collapsed)
// ---------------------------------------------------------------------------

function InlineThreadPreview({
  count,
  channelId,
  parentId,
  onExpand,
}: {
  count: number;
  channelId: string;
  parentId: string;
  onExpand: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!expanded) {
      setLoading(true);
      try {
        const res = await apiFetch(
          `/api/chat/channels/${channelId}/messages/${parentId}/thread`
        );
        if (res.ok) setReplies(await res.json());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    setExpanded((v) => !v);
  }

  return (
    <div className="mt-1 ml-1">
      <button
        className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium"
        onClick={toggle}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        <MessageSquare className="w-3.5 h-3.5" />
        {count} {count === 1 ? "reply" : "replies"}
      </button>

      {expanded && (
        <div className="mt-2 ml-4 border-l-2 border-border pl-3 space-y-2">
          {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {replies.map((r) => (
            <div key={r.id} className="flex gap-2">
              <Avatar name={r.sender?.name ?? "?"} userId={r.sender?.id} size="xs" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold">{r.sender?.name}</span>
                  <span className="text-[10px] text-muted-foreground">{formatTs(r.created_at)}</span>
                </div>
                <p className="text-xs text-foreground whitespace-pre-wrap break-words">{r.content}</p>
              </div>
            </div>
          ))}
          <button
            className="text-xs text-blue-500 hover:underline"
            onClick={onExpand}
          >
            Open in thread panel →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message item
// ---------------------------------------------------------------------------

function MessageItem({
  msg,
  grouped = false,
  compact = false,
  onOpenThread,
}: {
  msg: ChatMessage;
  grouped?: boolean;
  /** Smaller avatar + narrower gutter, used for thread replies so they read
   * as visually subordinate to the parent message they're replying to. */
  compact?: boolean;
  onOpenThread: (msg: ChatMessage) => void;
}) {
  const online = isOnline(msg.sender?.online_at);
  const threadCount = msg.thread_count ?? 0;
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const gutterWidth = compact ? "w-7" : "w-9";

  return (
    <div
      className={`group flex gap-3 hover:bg-muted/40 transition-colors relative ${
        compact ? "pl-8 pr-4" : "px-4"
      } ${
        grouped ? "py-0.5" : "py-1.5 mt-1.5"
      }`}
    >
      {/* Hover action: Reply in thread */}
      <div className="absolute right-4 top-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground bg-background border rounded-md px-2 py-1 shadow-sm hover:bg-accent hover:text-foreground"
          onClick={() => onOpenThread(msg)}
        >
          <MessageSquare className="w-3 h-3" />
          Reply in thread
        </button>
      </div>

      {/* Avatar — only shown for the first message in a consecutive run from
          the same sender, Slack-style; grouped messages show the time on
          hover in the same column instead. */}
      <div className={`relative flex-shrink-0 ${gutterWidth}`}>
        {grouped ? (
          <span className="hidden group-hover:block text-[10px] text-muted-foreground text-center leading-9 select-none">
            {time}
          </span>
        ) : (
          <div className="mt-0.5">
            <Avatar name={msg.sender?.name ?? "?"} userId={msg.sender?.id} size={compact ? "sm" : "md"} />
            {online && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm">{msg.sender?.name}</span>
            <span className="text-xs text-muted-foreground">{formatTs(msg.created_at)}</span>
          </div>
        )}
        <p
          className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
            msg._optimistic ? "opacity-50" : ""
          }`}
        >
          {msg.content}
        </p>

        {/* Inline thread preview */}
        {threadCount > 0 && !msg._optimistic && (
          <InlineThreadPreview
            count={threadCount}
            channelId={msg.channel_id}
            parentId={msg.id}
            onExpand={() => onOpenThread(msg)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message input
// ---------------------------------------------------------------------------

const EMOJI_OPTIONS = [
  "😀", "😂", "😊", "😍", "🤔", "😢", "😮", "😡",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👋",
  "❤️", "🔥", "🎉", "✅", "⭐", "💯", "🚀", "😅",
  "😴", "🤗", "🤯", "🥳", "😎", "🙄", "😬", "🤦",
];

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex-shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Add emoji"
        >
          <Smile className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 p-2">
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="text-lg rounded hover:bg-muted p-1 transition-colors"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MessageInput({
  onSend,
  placeholder,
  disabled,
}: {
  onSend: (content: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed) {
        onSend(trimmed);
        setText("");
      }
    }
  }

  function handleSend() {
    const t = text.trim();
    if (t) {
      onSend(t);
      setText("");
      ref.current?.focus();
    }
  }

  function handleEmojiPick(emoji: string) {
    setText((t) => t + emoji);
    ref.current?.focus();
  }

  return (
    <div className="px-4 py-3 border-t bg-background flex-shrink-0">
      <div className="flex items-end gap-2 bg-muted/40 border rounded-lg px-3 py-2">
        <textarea
          ref={ref}
          className="flex-1 resize-none bg-transparent text-sm min-h-[24px] max-h-32 focus:outline-none leading-relaxed"
          placeholder={placeholder ?? "Type a message... (Enter to send, Shift+Enter for new line)"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={disabled}
        />
        <EmojiPicker onPick={handleEmojiPick} />
        <button
          className="flex-shrink-0 p-1.5 rounded-md text-primary disabled:opacity-30 hover:bg-primary/10 transition-colors"
          disabled={!text.trim() || disabled}
          onClick={handleSend}
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        Enter to send &middot; Shift+Enter for new line
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread panel
// ---------------------------------------------------------------------------

function ThreadPanel({
  channel,
  parentMessage,
  currentUserId,
  currentUserName,
  onClose,
}: {
  channel: Channel;
  parentMessage: ChatMessage;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
}) {
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchReplies = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/api/chat/channels/${channel.id}/messages/${parentMessage.id}/thread`
      );
      if (res.ok) setReplies(await res.json());
    } catch {
      /* ignore */
    }
  }, [channel.id, parentMessage.id]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  useEffect(() => {
    const sub = supabase
      .channel(`chat-thread:${channel.id}:${parentMessage.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (msg.thread_parent_id === parentMessage.id) {
            setReplies((prev) => {
              if (prev.find((r) => r.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [channel.id, parentMessage.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  async function sendReply(content: string) {
    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      channel_id: channel.id,
      content,
      thread_parent_id: parentMessage.id,
      created_at: new Date().toISOString(),
      sender: { id: currentUserId, name: currentUserName },
      _optimistic: true,
    };
    setReplies((prev) => [...prev, optimistic]);
    try {
      const res = await apiFetch(`/api/chat/channels/${channel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, thread_parent_id: parentMessage.id }),
      });
      if (!res.ok) throw new Error();
      setReplies((prev) => prev.filter((r) => r.id !== optimistic.id));
    } catch {
      setReplies((prev) => prev.filter((r) => r.id !== optimistic.id));
      toast.error("Failed to send reply");
    }
  }

  return (
    <div className="w-[320px] flex-shrink-0 border-l bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">Thread</h3>
          <p className="text-xs text-muted-foreground truncate max-w-[240px]">
            {parentMessage.content}
          </p>
        </div>
        <button
          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ml-2"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Parent message */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex gap-2">
          <Avatar name={parentMessage.sender?.name ?? "?"} userId={parentMessage.sender?.id} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm">{parentMessage.sender?.name}</span>
              <span className="text-xs text-muted-foreground">{formatTs(parentMessage.created_at)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{parentMessage.content}</p>
          </div>
        </div>
        {replies.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 ml-11">
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </p>
        )}
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto py-2">
        {replies.map((r) => (
          <MessageItem key={r.id} msg={r} compact onOpenThread={() => {}} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput onSend={sendReply} placeholder="Reply in thread..." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar section
// ---------------------------------------------------------------------------

function SidebarSection({
  label,
  channels,
  activeId,
  onSelect,
  actions,
  onArchive,
  onDelete,
}: {
  label: string;
  channels: Channel[];
  activeId: string | null;
  onSelect: (ch: Channel) => void;
  actions?: React.ReactNode;
  onArchive?: (ch: Channel, archived: boolean) => void;
  onDelete?: (ch: Channel) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-2 mb-1 group/section">
        <button
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[#8e9297] hover:text-white transition-colors"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          {label}
        </button>
        {actions && (
          <div className="opacity-0 group-hover/section:opacity-100 transition-opacity">
            {actions}
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="space-y-0.5">
          {channels.map((ch) => (
            <SidebarChannel
              key={ch.id}
              ch={ch}
              active={ch.id === activeId}
              onClick={() => onSelect(ch)}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          ))}
          {channels.length === 0 && (
            <p className="px-3 py-1 text-xs text-[#72767d]">None yet</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatPage
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Role-aware nav links for the icon rail
// ---------------------------------------------------------------------------

const ADMIN_LINKS = [
  { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/dashboard/admin/admissions", label: "Admissions", icon: CheckSquare },
  { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/admin/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/admin/reminders", label: "Reminders", icon: Bell },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/admin/danger-zone", label: "Danger Zone", icon: AlertTriangle },
];
const TEACHER_LINKS = [
  { href: "/dashboard/teacher", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/teacher/assignments", label: "Assignments", icon: FileText },
  { href: "/dashboard/teacher/gradebook", label: "Gradebook", icon: ClipboardList },
  { href: "/dashboard/teacher/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/dashboard/teacher/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/teacher/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/teacher/reminders", label: "Reminders", icon: AlarmClock },
];
const STUDENT_LINKS = [
  { href: "/dashboard/student", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/student/assignments", label: "Assignments", icon: FileText },
  { href: "/dashboard/student/quizzes", label: "Quizzes", icon: ClipboardList },
  { href: "/dashboard/student/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/student/forum", label: "Forum", icon: MessageSquare },
  { href: "/dashboard/student/transcript", label: "Transcript", icon: Scroll },
];

function DashboardRail({ role }: { role?: string | null }) {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(false);

  const links =
    role === "admin" || role === "super_admin"
      ? ADMIN_LINKS
      : role === "teacher"
      ? TEACHER_LINKS
      : STUDENT_LINKS;

  const dashboardHref =
    role === "admin" || role === "super_admin"
      ? "/dashboard/admin"
      : role === "teacher"
      ? "/dashboard/teacher"
      : "/dashboard/student";

  return (
    <div
      className="flex-shrink-0 flex flex-col h-full overflow-hidden transition-all duration-200"
      style={{ width: expanded ? 200 : 52, backgroundColor: "#0f1117" }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <div className="flex items-center px-2 py-3 border-b border-white/10 flex-shrink-0 gap-2">
        <Link href={dashboardHref}>
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 cursor-pointer"
            style={{ backgroundColor: "#6366f1" }}
            title="Go to Dashboard"
          >
            <GraduationCap className="h-4 w-4 text-white" />
          </div>
        </Link>
        {expanded && (
          <span className="text-white/60 text-xs font-medium truncate">Dashboard</span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-1.5">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive =
            link.href === dashboardHref
              ? location === link.href
              : location.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href}>
              <div
                title={!expanded ? link.label : undefined}
                className={`flex items-center gap-2.5 px-1.5 py-2 rounded-md cursor-pointer transition-colors text-sm ${
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/8"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {expanded && <span className="truncate">{link.label}</span>}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Chat indicator at bottom */}
      <div className="px-1.5 pb-3 flex-shrink-0">
        <div
          className="flex items-center gap-2.5 px-1.5 py-2 rounded-md bg-white/10 text-white text-sm"
          title={!expanded ? "Chat" : undefined}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          {expanded && <span className="truncate">Chat</span>}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadMessage, setThreadMessage] = useState<ChatMessage | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement>(null);

  const currentUserId: string = (user as any)?.id ?? "";
  const currentUserName: string =
    (user as any)?.full_name ??
    (user as any)?.name ??
    (user as any)?.email ??
    "You";

  // -------------------------------------------------------------------------
  // Derived channel groups
  // -------------------------------------------------------------------------

  const activeChannels = channels.filter((c) => !c.isArchived);
  const archivedChannels = channels.filter((c) => c.isArchived);

  const schoolAndCourseChannels = activeChannels.filter(
    (c) => c.type === "public" || c.type === "course"
  );
  const directChannels = activeChannels.filter((c) => c.type === "direct");
  const privateChannels = activeChannels.filter((c) => c.type === "private");

  // -------------------------------------------------------------------------
  // Fetch channels on mount
  // -------------------------------------------------------------------------

  const fetchChannels = useCallback(async () => {
    try {
      // ?archived=true returns both archived and active channels — we split
      // them client-side so the "Archived" section can still show its
      // contents without a second round trip.
      const res = await apiFetch("/api/chat/channels?archived=true");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to load channels (${res.status})`);
      }
      const data: Channel[] = await res.json();
      setChannels(data);
      if (!activeChannel) {
        const firstActive = data.find((c) => !c.isArchived);
        if (firstActive) setActiveChannel(firstActive);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load channels");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  async function archiveChannel(ch: Channel, archived: boolean) {
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}/archive`, {
        method: "PUT",
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setChannels((prev) => prev.map((c) => (c.id === ch.id ? { ...c, isArchived: archived } : c)));
      if (archived && activeChannel?.id === ch.id) {
        const nextActive = channels.find((c) => c.id !== ch.id && !c.isArchived) ?? null;
        setActiveChannel(nextActive);
      }
      toast.success(archived ? `Archived "${ch.name}"` : `Unarchived "${ch.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update channel");
    }
  }

  async function deleteChannel(ch: Channel) {
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setChannels((prev) => prev.filter((c) => c.id !== ch.id));
      if (activeChannel?.id === ch.id) {
        const nextActive = channels.find((c) => c.id !== ch.id && !c.isArchived) ?? null;
        setActiveChannel(nextActive);
      }
      toast.success(`Deleted "${ch.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete channel");
    }
  }

  // -------------------------------------------------------------------------
  // Fetch messages when channel changes
  // -------------------------------------------------------------------------

  const fetchMessages = useCallback(async () => {
    if (!activeChannel) return;
    try {
      const res = await apiFetch(`/api/chat/channels/${activeChannel.id}/messages`);
      if (res.ok) setMessages(await res.json());
    } catch {
      /* ignore */
    }
  }, [activeChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMessages([]);
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom when switching channels
  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [activeChannel?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // -------------------------------------------------------------------------
  // Realtime subscription
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!activeChannel) return;
    const channelId = activeChannel.id;
    const sub = supabase
      .channel(`chat-messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (!msg.thread_parent_id) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          } else {
            // Update thread_count on parent
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.thread_parent_id
                  ? { ...m, thread_count: (m.thread_count ?? 0) + 1 }
                  : m
              )
            );
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [activeChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Online presence ping
  // -------------------------------------------------------------------------

  useEffect(() => {
    const ping = async () => {
      try {
        await apiFetch("/api/users/me/online", { method: "PUT" });
      } catch {
        /* ignore */
      }
    };
    ping();
    const iv = setInterval(ping, 30_000);
    return () => clearInterval(iv);
  }, []);

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------

  async function sendMessage(content: string) {
    if (!activeChannel) return;
    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      channel_id: activeChannel.id,
      content,
      created_at: new Date().toISOString(),
      sender: { id: currentUserId, name: currentUserName },
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await apiFetch(`/api/chat/channels/${activeChannel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    }
  }

  // -------------------------------------------------------------------------
  // Video call
  // -------------------------------------------------------------------------

  async function startVideoCall() {
    if (!activeChannel) return;
    // Open the tab synchronously, in direct response to the click, so the
    // browser doesn't treat it as a popup and block it — the fetch below is
    // async, and by the time it resolves the "user gesture" window has
    // often already closed in Safari/Chrome's popup heuristics.
    const popup = window.open("", "_blank");
    try {
      const res = await apiFetch("/api/video/chat-calls", {
        method: "POST",
        body: JSON.stringify({ channel_id: activeChannel.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = await res.json();
      const url = `https://meet.jit.si/${data.jitsi_room}`;
      if (popup) popup.location.href = url;
      else window.open(url, "_blank");
    } catch (err) {
      popup?.close();
      toast.error(err instanceof Error ? err.message : "Failed to start video call");
    }
  }

  function joinCall() {
    if (!activeChannel?.active_call?.jitsi_room) return;
    window.open(`https://meet.jit.si/${activeChannel.active_call.jitsi_room}`, "_blank");
  }

  // -------------------------------------------------------------------------
  // Channel helpers
  // -------------------------------------------------------------------------

  function handleChannelCreated(ch: Channel) {
    setChannels((prev) => {
      if (prev.find((c) => c.id === ch.id)) return prev;
      return [...prev, ch];
    });
    setActiveChannel(ch);
    setThreadMessage(null);
  }

  async function openDmWith(userId: string, name: string): Promise<boolean> {
    try {
      const res = await apiFetch("/api/chat/channels", {
        method: "POST",
        body: JSON.stringify({ name, type: "direct", memberIds: [userId] }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // DM already exists — find it in state or re-fetch then select it
        const existingId: string = body.channelId;
        const local = channels.find((c) => c.id === existingId);
        if (local) {
          selectChannel(local);
        } else {
          const r2 = await apiFetch("/api/chat/channels");
          if (r2.ok) {
            const all: Channel[] = await r2.json();
            setChannels(all);
            const found = all.find((c) => c.id === existingId);
            if (found) selectChannel(found);
          }
        }
        return true;
      }
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      handleChannelCreated(body as Channel);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open conversation");
      return false;
    }
  }

  async function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setMessages([]);
    setThreadMessage(null);
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}`);
      if (res.ok) {
        const detail: Channel = await res.json();
        setActiveChannel(detail);
        setChannels((prev) => prev.map((c) => (c.id === detail.id ? detail : c)));
      }
    } catch {
      /* ignore */
    }
  }

  const topMessages = messages.filter((m) => !m.thread_parent_id);

  // Assign each distinct speaker in this conversation a color in the order
  // they first appear, so any two (or more) people chatting always get
  // visually distinct colors instead of an occasional hash collision.
  const participantColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let next = 0;
    for (const m of messages) {
      const id = m.sender?.id;
      if (id && !map.has(id)) {
        map.set(id, CONVERSATION_COLORS[next % CONVERSATION_COLORS.length]);
        next += 1;
      }
    }
    return map;
  }, [messages]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <ParticipantColorContext.Provider value={participantColorMap}>
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* ------------------------------------------------------------------ */}
      {/* Dashboard icon rail (Supabase-style) — hidden on mobile once a
          conversation is open, so it doesn't obstruct it like a native app */}
      {/* ------------------------------------------------------------------ */}
      <div className={activeChannel ? "hidden md:flex" : "flex"}>
        <DashboardRail role={user?.role} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Chat Sidebar — full-width on mobile when no conversation is open,
          hidden on mobile once one is (single-pane, like a native app) */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className={`flex-shrink-0 flex-col overflow-hidden w-full md:w-[240px] ${
          activeChannel ? "hidden md:flex" : "flex"
        }`}
        style={{ backgroundColor: "#1e1e2e" }}
      >
        {/* Workspace header */}
        <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
          <h1 className="font-bold text-white text-base">Chat</h1>
          <p className="text-[#b9bbbe] text-xs mt-0.5">Learning Community</p>
        </div>

        {/* People search */}
        <div className="pt-2 flex-shrink-0">
          <PeopleSearch onOpenDm={openDmWith} directChannels={directChannels} />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <SidebarSection
            label="Channels"
            channels={schoolAndCourseChannels}
            activeId={activeChannel?.id ?? null}
            onSelect={selectChannel}
          />
          <SidebarSection
            label="Direct Messages"
            channels={directChannels}
            activeId={activeChannel?.id ?? null}
            onSelect={selectChannel}
            actions={<NewChannelDialog onCreated={handleChannelCreated} onOpenDm={openDmWith} />}
            onArchive={archiveChannel}
            onDelete={deleteChannel}
          />
          <SidebarSection
            label="Private Channels"
            channels={privateChannels}
            activeId={activeChannel?.id ?? null}
            onSelect={selectChannel}
            actions={<NewChannelDialog onCreated={handleChannelCreated} onOpenDm={openDmWith} />}
            onArchive={archiveChannel}
            onDelete={deleteChannel}
          />
          {archivedChannels.length > 0 && (
            <SidebarSection
              label="Archived"
              channels={archivedChannels}
              activeId={activeChannel?.id ?? null}
              onSelect={selectChannel}
              onArchive={archiveChannel}
              onDelete={deleteChannel}
            />
          )}
        </nav>

        {/* Current user */}
        {currentUserName && (
          <div className="px-3 py-3 border-t border-white/10 flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <Avatar name={currentUserName} size="sm" />
              <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border-2 rounded-full" style={{ borderColor: "#1e1e2e" }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{currentUserName}</p>
              <p className="text-xs text-[#72767d]">Online</p>
            </div>
          </div>
        )}
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Main area */}
      {/* ------------------------------------------------------------------ */}
      {activeChannel ? (
        <div className="flex flex-1 min-w-0">
          {/* Messages column */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Channel header */}
            <header className="flex items-center justify-between px-3 md:px-5 py-3 border-b bg-background flex-shrink-0 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setActiveChannel(null)}
                  className="md:hidden -ml-1 p-1.5 rounded-md hover:bg-muted text-muted-foreground shrink-0"
                  title="Back to conversations"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <ChannelIcon type={activeChannel.type} className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <h2 className="font-bold text-base truncate">{activeChannel.name}</h2>
                {activeChannel.member_count != null && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {activeChannel.member_count}{" "}
                    {activeChannel.member_count !== 1 ? "members" : "member"}
                  </span>
                )}
                {activeChannel.description && (
                  <>
                    <span className="text-muted-foreground/40 text-sm">|</span>
                    <span className="text-sm text-muted-foreground truncate">{activeChannel.description}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {activeChannel.active_call ? (
                  <Button size="sm" onClick={joinCall}>
                    <Phone className="w-4 h-4 mr-1.5" />
                    Join Call
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={startVideoCall}>
                    <Phone className="w-4 h-4 mr-1.5" />
                    Video Call
                  </Button>
                )}
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-4">
              {topMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <ChannelIcon type={activeChannel.type} className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">
                    Welcome to #{activeChannel.name}!
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    This is the beginning of the #{activeChannel.name} channel. Send a message to get started.
                  </p>
                </div>
              )}
              <div className="space-y-0.5">
                {topMessages.map((m, i) => {
                  const prev = topMessages[i - 1];
                  const grouped =
                    !!prev &&
                    prev.sender?.id === m.sender?.id &&
                    new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() <
                      5 * 60 * 1000;
                  return (
                    <MessageItem
                      key={m.id}
                      msg={m}
                      grouped={grouped}
                      onOpenThread={setThreadMessage}
                    />
                  );
                })}
              </div>
              <div ref={messagesBottomRef} />
            </div>

            {/* Message input */}
            <MessageInput
              onSend={sendMessage}
              placeholder={`Message ${activeChannel.type === "direct" ? "" : "#"}${activeChannel.name}`}
            />
          </div>

          {/* Thread panel */}
          {threadMessage && (
            <ThreadPanel
              channel={activeChannel}
              parentMessage={threadMessage}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              onClose={() => setThreadMessage(null)}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto">
              <MessageSquare className="w-10 h-10 text-muted-foreground opacity-50" />
            </div>
            <h2 className="text-xl font-semibold">No channel selected</h2>
            <p className="text-muted-foreground text-sm">
              Pick a channel from the sidebar to start chatting.
            </p>
          </div>
        </div>
      )}
    </div>
    </ParticipantColorContext.Provider>
  );
}
