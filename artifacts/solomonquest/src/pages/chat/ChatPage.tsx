import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Send, Hash, Lock, User, Phone, Search, Plus, X, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Channel {
  id: string;
  name: string;
  type: "public" | "course" | "private" | "direct";
  unread_count?: number;
  member_count?: number;
  active_call?: { jitsi_room: string } | null;
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

function nameHash(name: string): string {
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-lime-500",
    "bg-green-500",
    "bg-emerald-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-sky-500",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-rose-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string): string {
  return name
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
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div
      className={`${sz} rounded-full ${nameHash(name)} flex items-center justify-center text-white font-semibold flex-shrink-0`}
    >
      {initials(name)}
    </div>
  );
}

function ChannelIcon({ type }: { type: Channel["type"] }) {
  if (type === "private") return <Lock className="w-3.5 h-3.5" />;
  if (type === "direct") return <User className="w-3.5 h-3.5" />;
  return <Hash className="w-3.5 h-3.5" />;
}

// ---------------------------------------------------------------------------
// New Channel Dialog
// ---------------------------------------------------------------------------

function NewChannelDialog({ onCreated }: { onCreated: (ch: Channel) => void }) {
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
    if (!q.trim()) { setUserResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/users/search?query=${encodeURIComponent(q)}`);
        if (res.ok) setUserResults(await res.json());
      } catch { /* ignore */ }
    }, 300);
  }, []);

  useEffect(() => { searchUsers(userQuery); }, [userQuery, searchUsers]);

  function toggleUser(u: UserResult) {
    setSelectedUsers((prev) =>
      prev.find((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]
    );
  }

  async function handleCreate() {
    if (selectedUsers.length === 0) { toast.error("Select at least one user"); return; }
    const name =
      mode === "direct"
        ? selectedUsers.map((u) => u.name).join(", ")
        : channelName.trim();
    if (mode === "private" && !name) { toast.error("Enter a channel name"); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/chat/channels", {
        method: "POST",
        body: JSON.stringify({ name, type: mode, memberIds: selectedUsers.map((u) => u.id) }),
      });
      if (!res.ok) throw new Error();
      const ch: Channel = await res.json();
      onCreated(ch);
      setOpen(false);
      setChannelName("");
      setSelectedUsers([]);
      setUserQuery("");
    } catch {
      toast.error("Failed to create channel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Plus className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "private" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("private")}
            >
              <Lock className="w-3.5 h-3.5 mr-1" /> Private
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

          {/* User search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search users..."
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />
          </div>

          {/* Selected users */}
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

          {/* Results */}
          {userResults.length > 0 && (
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {userResults.map((u) => {
                const sel = !!selectedUsers.find((x) => x.id === u.id);
                return (
                  <button
                    key={u.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 ${sel ? "bg-primary/10" : ""}`}
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
            {loading ? "Creating..." : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Message item
// ---------------------------------------------------------------------------

function MessageItem({
  msg,
  onOpenThread,
}: {
  msg: ChatMessage;
  onOpenThread: (msg: ChatMessage) => void;
}) {
  const online = isOnline(msg.sender?.online_at);
  return (
    <div className="flex gap-3 group px-4 py-2 hover:bg-accent/30 rounded-lg">
      <div className="relative flex-shrink-0">
        <Avatar name={msg.sender?.name ?? "?"} />
        {online && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm text-foreground">{msg.sender?.name}</span>
          <span className="text-xs text-muted-foreground">{formatTs(msg.created_at)}</span>
        </div>
        <p className={`text-sm text-foreground whitespace-pre-wrap break-words ${msg._optimistic ? "opacity-60" : ""}`}>
          {msg.content}
        </p>
        {(msg.thread_count ?? 0) > 0 && (
          <button
            className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => onOpenThread(msg)}
          >
            <MessageSquare className="w-3 h-3" />
            {msg.thread_count} {msg.thread_count === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message input
// ---------------------------------------------------------------------------

function MessageInput({
  onSend,
  placeholder,
}: {
  onSend: (content: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed) { onSend(trimmed); setText(""); }
    }
  }

  return (
    <div className="flex items-end gap-2 p-4 border-t bg-background">
      <textarea
        className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm min-h-[40px] max-h-32 focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder={placeholder ?? "Type a message... (Enter to send, Shift+Enter for newline)"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        rows={1}
      />
      <Button
        size="icon"
        disabled={!text.trim()}
        onClick={() => { const t = text.trim(); if (t) { onSend(t); setText(""); } }}
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread panel
// ---------------------------------------------------------------------------

function ThreadPanel({
  channel,
  parentMessage,
  onClose,
}: {
  channel: Channel;
  parentMessage: ChatMessage;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/api/chat/channels/${channel.id}/messages?thread_parent_id=${parentMessage.id}`
      );
      if (res.ok) setMessages(await res.json());
    } catch { /* ignore */ }
  }, [channel.id, parentMessage.id]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

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
            setMessages((prev) => [...prev, msg]);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel.id, parentMessage.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendReply(content: string) {
    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      channel_id: channel.id,
      content,
      thread_parent_id: parentMessage.id,
      created_at: new Date().toISOString(),
      sender: { id: "me", name: "You" },
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await apiFetch(`/api/chat/channels/${channel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, thread_parent_id: parentMessage.id }),
      });
      if (!res.ok) throw new Error();
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error("Failed to send reply");
    }
  }

  return (
    <div className="w-[300px] flex-shrink-0 border-l bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h3 className="font-semibold text-sm">Thread</h3>
          <p className="text-xs text-muted-foreground truncate max-w-[220px]">
            {parentMessage.content}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {messages.map((m) => (
          <MessageItem key={m.id} msg={m} onOpenThread={() => {}} />
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={sendReply} placeholder="Reply in thread..." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatPage
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadMessage, setThreadMessage] = useState<ChatMessage | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------
  // Fetch channels
  // -------------------------------------------------------------------

  const fetchChannels = useCallback(async () => {
    try {
      const res = await apiFetch("/api/chat/channels");
      if (res.ok) {
        const data: Channel[] = await res.json();
        setChannels(data);
        if (!activeChannel && data.length > 0) setActiveChannel(data[0]);
      }
    } catch { /* ignore */ }
  }, [activeChannel]);

  useEffect(() => { fetchChannels(); }, []);  // intentionally run once on mount

  // -------------------------------------------------------------------
  // Fetch messages for active channel
  // -------------------------------------------------------------------

  const fetchMessages = useCallback(async () => {
    if (!activeChannel) return;
    try {
      const res = await apiFetch(`/api/chat/channels/${activeChannel.id}/messages`);
      if (res.ok) setMessages(await res.json());
    } catch { /* ignore */ }
  }, [activeChannel?.id]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [activeChannel?.id]);

  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // -------------------------------------------------------------------
  // Realtime subscription
  // -------------------------------------------------------------------

  useEffect(() => {
    if (!activeChannel) return;
    const sub = supabase
      .channel(`chat:${activeChannel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (!msg.thread_parent_id) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [activeChannel?.id]);

  // -------------------------------------------------------------------
  // Online presence ping
  // -------------------------------------------------------------------

  useEffect(() => {
    const ping = async () => { try { await apiFetch("/api/users/me/online", { method: "PUT" }); } catch { /* ignore */ } };
    ping();
    const iv = setInterval(ping, 30_000);
    return () => clearInterval(iv);
  }, []);

  // -------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------

  async function sendMessage(content: string) {
    if (!activeChannel) return;
    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      channel_id: activeChannel.id,
      content,
      created_at: new Date().toISOString(),
      sender: { id: user?.id ?? "me", name: user?.user_metadata?.name ?? user?.email ?? "You" },
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await apiFetch(`/api/chat/channels/${activeChannel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error("Failed to send message");
    }
  }

  // -------------------------------------------------------------------
  // Video call
  // -------------------------------------------------------------------

  async function startVideoCall() {
    if (!activeChannel) return;
    try {
      const res = await apiFetch("/api/video/chat-calls", {
        method: "POST",
        body: JSON.stringify({ channel_id: activeChannel.id }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      window.open(`https://meet.jit.si/${data.jitsi_room}`, "_blank");
    } catch {
      toast.error("Failed to start video call");
    }
  }

  async function joinCall() {
    if (!activeChannel?.active_call?.jitsi_room) return;
    window.open(`https://meet.jit.si/${activeChannel.active_call.jitsi_room}`, "_blank");
  }

  function handleChannelCreated(ch: Channel) {
    setChannels((prev) => {
      if (prev.find((c) => c.id === ch.id)) return prev;
      return [...prev, ch];
    });
    setActiveChannel(ch);
  }

  async function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setMessages([]);
    setThreadMessage(null);
    // Refresh channel detail for active_call
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}`);
      if (res.ok) {
        const detail: Channel = await res.json();
        setActiveChannel(detail);
        setChannels((prev) => prev.map((c) => (c.id === detail.id ? detail : c)));
      }
    } catch { /* ignore */ }
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Sidebar */}
      {/* ------------------------------------------------------------------ */}
      <aside className="w-[250px] flex-shrink-0 border-r bg-card flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-base">Channels</h2>
          <NewChannelDialog onCreated={handleChannelCreated} />
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {channels.map((ch) => {
            const active = activeChannel?.id === ch.id;
            return (
              <button
                key={ch.id}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md mx-1 text-left transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                style={{ width: "calc(100% - 8px)" }}
                onClick={() => selectChannel(ch)}
              >
                <ChannelIcon type={ch.type} />
                <span className="flex-1 truncate">{ch.name}</span>
                {(ch.unread_count ?? 0) > 0 && (
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                      active ? "bg-white/20 text-white" : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {ch.unread_count}
                  </span>
                )}
              </button>
            );
          })}
          {channels.length === 0 && (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">
              No channels yet. Create one above.
            </p>
          )}
        </nav>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Main area */}
      {/* ------------------------------------------------------------------ */}
      {activeChannel ? (
        <div className="flex flex-1 min-w-0">
          {/* Messages column */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Header */}
            <header className="flex items-center justify-between px-5 py-3 border-b bg-card flex-shrink-0">
              <div className="flex items-center gap-2">
                <ChannelIcon type={activeChannel.type} />
                <span className="font-semibold text-base">{activeChannel.name}</span>
                {activeChannel.member_count != null && (
                  <span className="text-xs text-muted-foreground">
                    {activeChannel.member_count} member{activeChannel.member_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeChannel.active_call ? (
                  <Button size="sm" variant="default" onClick={joinCall}>
                    <Phone className="w-4 h-4 mr-1" />
                    Join Call
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={startVideoCall}>
                    <Phone className="w-4 h-4 mr-1" />
                    Video Call
                  </Button>
                )}
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-3 space-y-0.5">
              {messages
                .filter((m) => !m.thread_parent_id)
                .map((m) => (
                  <MessageItem key={m.id} msg={m} onOpenThread={setThreadMessage} />
                ))}
              <div ref={messagesBottomRef} />
            </div>

            {/* Input */}
            <MessageInput
              onSend={sendMessage}
              placeholder={`Message #${activeChannel.name}`}
            />
          </div>

          {/* Thread panel */}
          {threadMessage && (
            <ThreadPanel
              channel={activeChannel}
              parentMessage={threadMessage}
              onClose={() => setThreadMessage(null)}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <MessageSquare className="w-12 h-12 mx-auto opacity-20" />
            <p className="text-sm">Select a channel to start chatting</p>
          </div>
        </div>
      )}
    </div>
  );
}
