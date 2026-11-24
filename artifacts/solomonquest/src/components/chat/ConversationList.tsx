import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Hash,
  Home,
  Lock,
  MessageSquarePlus,
  MoreHorizontal,
  Search,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { NotificationBell } from "@/components/NotificationBell";
import { ChatAvatar } from "./ChatAvatar";
import { apiFetch, errorMessage, normalizeChannel } from "./chatApi";
import { isOnline, listTime, roleLabel } from "./format";
import type { Channel, PersonResult } from "./types";

function fullName(p: PersonResult) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.internal_email || "Unknown";
}

function usePeopleSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const q = query.trim();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/users/search?query=${encodeURIComponent(q)}`);
        if (res.ok && alive) setResults(await res.json());
      } catch {
        /* ignore */
      } finally {
        if (alive) setLoading(false);
      }
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, enabled]);
  return { results, loading };
}

// ---------------------------------------------------------------------------
// New conversation dialog (DM or private channel)
// ---------------------------------------------------------------------------

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreated,
  onOpenDm,
  initialMode = "direct",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ch: Channel) => void;
  onOpenDm: (userId: string, name: string) => Promise<boolean>;
  initialMode?: "direct" | "private";
}) {
  const [mode, setMode] = useState<"private" | "direct">(initialMode);
  const [channelName, setChannelName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const { results, loading } = usePeopleSearch(query, open);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setSelected([]);
      setQuery("");
      setChannelName("");
    }
  }, [open, initialMode]);

  function toggle(u: { id: string; name: string }) {
    if (mode === "direct") {
      setSelected((prev) => (prev[0]?.id === u.id ? [] : [u]));
      return;
    }
    setSelected((prev) => (prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]));
  }

  async function create() {
    if (selected.length === 0) {
      toast.error(mode === "direct" ? "Pick someone to message" : "Pick at least 2 people");
      return;
    }
    if (mode === "direct") {
      setBusy(true);
      const ok = await onOpenDm(selected[0].id, selected[0].name);
      setBusy(false);
      if (ok) onOpenChange(false);
      return;
    }
    const name = channelName.trim();
    if (!name) {
      toast.error("Enter a channel name");
      return;
    }
    // A channel is a group conversation — you plus at least 2 others.
    if (selected.length < 2) {
      toast.error("A channel needs at least 3 people — pick 2 more, or send a direct message instead");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/chat/channels", {
        method: "POST",
        body: JSON.stringify({ name, type: "private", memberIds: selected.map((u) => u.id) }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to create channel"));
      onCreated(normalizeChannel(await res.json()));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{mode === "direct" ? "New message" : "New private channel"}</DialogTitle>
          <DialogDescription>
            {mode === "direct" ? "Start a one-to-one conversation." : "A private group with you and at least two others."}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 space-y-3">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted" role="tablist" aria-label="Conversation type">
            {(["direct", "private"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  if (m === "direct") setSelected((s) => s.slice(0, 1));
                }}
                className={`h-9 rounded-md text-sm font-medium transition-colors ${
                  mode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "direct" ? "Direct message" : "Private channel"}
              </button>
            ))}
          </div>
          {mode === "private" && (
            <Input placeholder="Channel name" value={channelName} onChange={(e) => setChannelName(e.target.value)} aria-label="Channel name" />
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input className="pl-9" placeholder="Search people…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" autoFocus />
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <span key={u.id} className="inline-flex items-center gap-1 bg-primary/10 text-foreground text-xs pl-2.5 pr-1 py-1 rounded-full">
                  {u.name}
                  <button type="button" onClick={() => toggle(u)} className="h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-primary/15" aria-label={`Remove ${u.name}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 border-t max-h-[min(320px,40dvh)] overflow-y-auto" role="listbox" aria-multiselectable={mode === "private"} aria-label="People">
          {loading && results.length === 0 && <p className="px-5 py-3 text-sm text-muted-foreground">Searching…</p>}
          {!loading && results.length === 0 && <p className="px-5 py-3 text-sm text-muted-foreground">No people found.</p>}
          {results.map((p) => {
            const name = fullName(p);
            const sel = selected.some((x) => x.id === p.id);
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => toggle({ id: p.id, name })}
                className={`w-full flex items-center gap-3 px-5 h-14 text-left hover:bg-muted ${sel ? "bg-primary/5" : ""}`}
              >
                <ChatAvatar name={name} userId={p.id} url={p.avatar_url} size="sm" stable />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{roleLabel(p.role) ?? p.internal_email ?? ""}</span>
                </span>
                <span
                  className={`h-5 w-5 rounded-full border-2 shrink-0 ${sel ? "bg-primary border-primary" : "border-input"}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy || selected.length === 0}>
            {busy ? (mode === "direct" ? "Opening…" : "Creating…") : mode === "direct" ? "Message" : "Create channel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function previewText(ch: Channel, currentUserId: string): string {
  const lm = ch.lastMessage;
  if (!lm) return ch.type === "direct" ? roleLabel(ch.otherUser?.role) ?? "No messages yet" : "No messages yet";
  const body = lm.attachmentName ? `📎 ${lm.attachmentName}` : lm.content;
  if (lm.senderId === currentUserId) return `You: ${body}`;
  if (ch.type !== "direct" && lm.senderName) return `${lm.senderName.split(" ")[0]}: ${body}`;
  return body;
}

const ConversationRow = memo(function ConversationRow({
  ch,
  active,
  currentUserId,
  onSelect,
  onArchive,
  onDelete,
}: {
  ch: Channel;
  active: boolean;
  currentUserId: string;
  onSelect: (ch: Channel) => void;
  onArchive?: (ch: Channel, archived: boolean) => void;
  onDelete?: (ch: Channel) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const unread = ch.unread_count ?? 0;
  const hasUnread = unread > 0;
  const time = listTime(ch.lastMessage?.createdAt ?? null);
  const online = ch.type === "direct" && isOnline(ch.otherUser?.onlineAt);
  const preview = previewText(ch, currentUserId);

  return (
    <li className="relative group">
      <button
        type="button"
        data-conv-row={ch.id}
        onClick={() => onSelect(ch)}
        aria-current={active ? "page" : undefined}
        aria-label={`${ch.name}${hasUnread ? `, ${unread} unread` : ""}${online ? ", online" : ""}. ${preview}`}
        className={`w-full flex items-center gap-3 pl-3 pr-10 md:pr-9 py-2 min-h-[60px] md:min-h-[52px] rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
          active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"
        }`}
      >
        {active && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-sidebar-primary" aria-hidden="true" />}
        {ch.type === "direct" ? (
          <ChatAvatar name={ch.name} userId={ch.otherUser?.id} size="lg" online={online} dotRing="ring-sidebar" stable />
        ) : (
          <span
            className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
              hasUnread ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent text-sidebar-foreground"
            }`}
            aria-hidden="true"
          >
            {ch.type === "private" ? <Lock className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`flex-1 min-w-0 truncate text-[15px] md:text-sm ${hasUnread ? "font-bold text-sidebar-accent-foreground" : "font-medium"}`}>
              {ch.name}
            </span>
            {time && (
              <span className={`text-[11px] shrink-0 tabular-nums ${hasUnread ? "text-sidebar-primary font-semibold" : "text-sidebar-foreground/60"}`}>
                {time}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 mt-0.5">
            <span className={`flex-1 min-w-0 truncate text-[13px] md:text-xs ${hasUnread ? "text-sidebar-accent-foreground/90" : "text-sidebar-foreground/60"}`}>
              {preview}
            </span>
            {hasUnread && (
              <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-[11px] font-bold flex items-center justify-center tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
        </span>
      </button>
      {(onArchive || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 md:h-8 md:w-8 inline-flex items-center justify-center rounded-lg text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label={`Options for ${ch.name}`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {onArchive && (
              <DropdownMenuItem onClick={() => onArchive(ch, !ch.isArchived)}>
                {ch.isArchived ? <ArchiveRestore className="w-4 h-4 mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
                {ch.isArchived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="w-4 h-4 mr-2" />
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
                This permanently deletes the conversation and all its messages for everyone in it. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(ch)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
});

function Section({
  id,
  label,
  count,
  defaultCollapsed = false,
  action,
  children,
}: {
  id: string;
  label: string;
  count: number;
  defaultCollapsed?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <section className="mb-2" aria-labelledby={`sec-${id}`}>
      <div className="flex items-center justify-between px-2 h-9">
        <button
          type="button"
          id={`sec-${id}`}
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="flex items-center gap-1 h-8 px-1 rounded-md text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
          {label}
          <span className="font-normal normal-case tracking-normal text-sidebar-foreground/45 ml-1">{count}</span>
        </button>
        {action}
      </div>
      {!collapsed && children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function ConversationList({
  channels,
  activeId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  dashboardHref,
  onSelect,
  onArchive,
  onDelete,
  onCreated,
  onOpenDm,
  loading,
  showBell = false,
}: {
  /** Phones: the bell lives in the list header (only one bell may mount —
   * it owns a fixed realtime topic). */
  showBell?: boolean;
  channels: Channel[];
  activeId: string | null;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string | null;
  dashboardHref: string;
  onSelect: (ch: Channel) => void;
  onArchive: (ch: Channel, archived: boolean) => void;
  onDelete: (ch: Channel) => void;
  onCreated: (ch: Channel) => void;
  onOpenDm: (userId: string, name: string) => Promise<boolean>;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<null | "direct" | "private">(null);
  const navRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const people = usePeopleSearch(query, q.length > 0);

  const groups = useMemo(() => {
    const match = (c: Channel) => !q || c.name.toLowerCase().includes(q);
    const recent = (a: Channel, b: Channel) =>
      (b.lastMessage?.createdAt ?? b.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? a.createdAt ?? "");
    const active = channels.filter((c) => !c.isArchived && match(c));
    return {
      channels: active.filter((c) => c.type === "public" || c.type === "course"),
      direct: active.filter((c) => c.type === "direct").sort(recent),
      private: active.filter((c) => c.type === "private").sort(recent),
      archived: channels.filter((c) => c.isArchived && match(c)),
    };
  }, [channels, q]);

  const existingDmUserIds = useMemo(
    () => new Set(channels.filter((c) => c.type === "direct" && c.otherUser).map((c) => c.otherUser!.id)),
    [channels]
  );
  const peopleMatches = q ? people.results.filter((p) => !existingDmUserIds.has(p.id)).slice(0, 6) : [];
  const totalShown = groups.channels.length + groups.direct.length + groups.private.length + groups.archived.length;

  // Arrow keys move between conversation rows.
  function onNavKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const rows = Array.from(navRef.current?.querySelectorAll<HTMLElement>("[data-conv-row]") ?? []);
    if (rows.length === 0) return;
    const i = rows.indexOf(document.activeElement as HTMLElement);
    let next = i;
    if (e.key === "ArrowDown") next = i < 0 ? 0 : Math.min(rows.length - 1, i + 1);
    if (e.key === "ArrowUp") next = i < 0 ? rows.length - 1 : Math.max(0, i - 1);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = rows.length - 1;
    e.preventDefault();
    rows[next]?.focus();
  }

  const rowProps = { currentUserId, onSelect };
  const newBtn =
    "h-8 w-8 inline-flex items-center justify-center rounded-md text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

  return (
    <div className="flex flex-col h-full min-h-0 bg-sidebar text-sidebar-foreground">
      <header className="flex items-center gap-2 px-3 md:px-4 h-14 md:h-16 border-b border-sidebar-border shrink-0 pt-[env(safe-area-inset-top)] box-content md:box-border">
        <Link
          href={dashboardHref}
          className="md:hidden h-10 w-10 -ml-1 inline-flex items-center justify-center rounded-full hover:bg-sidebar-accent text-sidebar-foreground"
          aria-label="Back to dashboard"
        >
          <Home className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-bold text-lg md:text-base leading-tight text-sidebar-accent-foreground">Chat</h1>
          <p className="hidden md:block text-xs text-sidebar-foreground/60 truncate">Learning community</p>
        </div>
        {showBell && (
          <div className="[&_button]:text-sidebar-foreground [&_svg]:text-sidebar-foreground">
            <NotificationBell />
          </div>
        )}
        <button
          type="button"
          onClick={() => setDialog("direct")}
          className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
          aria-label="New message"
          title="New message"
        >
          <SquarePen className="w-[18px] h-[18px]" />
        </button>
      </header>

      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sidebar-foreground/55" aria-hidden="true" />
          <input
            type="search"
            className="w-full h-10 pl-9 pr-9 text-[15px] md:text-sm rounded-xl bg-sidebar-accent border border-sidebar-border text-sidebar-accent-foreground placeholder:text-sidebar-foreground/55 focus:outline-none focus:ring-2 focus:ring-sidebar-ring/60 [&::-webkit-search-cancel-button]:hidden"
            placeholder="Search conversations or people"
            aria-label="Search conversations or people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "ArrowDown") {
                e.preventDefault();
                navRef.current?.querySelector<HTMLElement>("[data-conv-row], [data-person-row]")?.focus();
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-sidebar-foreground/60 hover:text-sidebar-accent-foreground"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div ref={navRef} onKeyDown={onNavKeyDown} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-4" aria-label="Conversations">
        {loading && channels.length === 0 ? (
          <div className="space-y-2 px-1 pt-2" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <div className="h-11 w-11 rounded-xl bg-sidebar-accent animate-pulse motion-reduce:animate-none" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-sidebar-accent animate-pulse motion-reduce:animate-none" />
                  <div className="h-3 w-1/2 rounded bg-sidebar-accent/70 animate-pulse motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {groups.channels.length > 0 && (
              <Section id="channels" label="Channels" count={groups.channels.length}>
                <ul className="space-y-0.5">
                  {groups.channels.map((ch) => (
                    <ConversationRow key={ch.id} ch={ch} active={ch.id === activeId} {...rowProps} />
                  ))}
                </ul>
              </Section>
            )}
            {(groups.direct.length > 0 || !q) && (
              <Section
                id="direct"
                label="Direct messages"
                count={groups.direct.length}
                action={
                  <button type="button" className={newBtn} onClick={() => setDialog("direct")} aria-label="New direct message" title="New direct message">
                    <MessageSquarePlus className="w-4 h-4" />
                  </button>
                }
              >
                <ul className="space-y-0.5">
                  {groups.direct.map((ch) => (
                    <ConversationRow key={ch.id} ch={ch} active={ch.id === activeId} {...rowProps} onArchive={onArchive} onDelete={onDelete} />
                  ))}
                </ul>
                {groups.direct.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setDialog("direct")}
                    className="w-full text-left px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-accent-foreground rounded-lg hover:bg-sidebar-accent/60"
                  >
                    No direct messages yet — start one
                  </button>
                )}
              </Section>
            )}
            {(groups.private.length > 0 || !q) && (
              <Section
                id="private"
                label="Private channels"
                count={groups.private.length}
                action={
                  <button type="button" className={newBtn} onClick={() => setDialog("private")} aria-label="New private channel" title="New private channel">
                    <MessageSquarePlus className="w-4 h-4" />
                  </button>
                }
              >
                <ul className="space-y-0.5">
                  {groups.private.map((ch) => (
                    <ConversationRow key={ch.id} ch={ch} active={ch.id === activeId} {...rowProps} onArchive={onArchive} onDelete={onDelete} />
                  ))}
                </ul>
                {groups.private.length === 0 && <p className="px-3 py-2 text-sm text-sidebar-foreground/55">None yet</p>}
              </Section>
            )}
            {groups.archived.length > 0 && (
              <Section id="archived" label="Archived" count={groups.archived.length} defaultCollapsed={!q}>
                <ul className="space-y-0.5">
                  {groups.archived.map((ch) => (
                    <ConversationRow key={ch.id} ch={ch} active={ch.id === activeId} {...rowProps} onArchive={onArchive} onDelete={onDelete} />
                  ))}
                </ul>
              </Section>
            )}

            {q && (
              <Section id="people" label="People" count={peopleMatches.length}>
                {people.loading && peopleMatches.length === 0 && <p className="px-3 py-2 text-sm text-sidebar-foreground/55">Searching…</p>}
                <ul className="space-y-0.5">
                  {peopleMatches.map((p) => {
                    const name = fullName(p);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          data-person-row
                          data-conv-row={`person-${p.id}`}
                          onClick={async () => {
                            if (await onOpenDm(p.id, name)) setQuery("");
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 min-h-[56px] rounded-xl text-left hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                        >
                          <ChatAvatar name={name} userId={p.id} url={p.avatar_url} size="lg" stable />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-sidebar-accent-foreground">{name}</span>
                            <span className="block truncate text-xs text-sidebar-foreground/60">
                              {roleLabel(p.role) ?? "Person"} · Start a conversation
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!people.loading && peopleMatches.length === 0 && (
                  <p className="px-3 py-2 text-sm text-sidebar-foreground/55">No other people match "{query.trim()}"</p>
                )}
              </Section>
            )}

            {!q && totalShown === 0 && (
              <div className="text-center px-6 py-10">
                <p className="font-semibold text-sidebar-accent-foreground">No conversations yet</p>
                <p className="text-sm text-sidebar-foreground/60 mt-1">Start a direct message with a classmate or teacher.</p>
                <Button className="mt-4" onClick={() => setDialog("direct")}>
                  New message
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="hidden md:flex px-3 py-3 border-t border-sidebar-border items-center gap-2.5 shrink-0">
        <ChatAvatar name={currentUserName} userId={currentUserId} url={currentUserAvatar} size="sm" online dotRing="ring-sidebar" stable />
        <div className="min-w-0">
          <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{currentUserName}</p>
          <p className="text-xs text-sidebar-foreground/60">Online</p>
        </div>
      </div>

      <NewConversationDialog
        open={dialog !== null}
        initialMode={dialog ?? "direct"}
        onOpenChange={(o) => !o && setDialog(null)}
        onCreated={onCreated}
        onOpenDm={onOpenDm}
      />
    </div>
  );
}
