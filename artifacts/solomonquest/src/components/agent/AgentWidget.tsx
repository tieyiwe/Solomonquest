import { useEffect, useRef, useState, Fragment } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sparkles, X, Send, Loader2, Check, XCircle } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  name: string;
  input: Record<string, unknown>;
}

async function authedFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(init?.headers ?? {}),
    },
  });
}

function actionLabel(action: PendingAction): string {
  if (action.name === "create_reminder") {
    const input = action.input as { message?: string; target_role?: string; send_at?: string };
    return `Schedule a reminder for ${input.target_role ?? "recipients"}: "${input.message ?? ""}"`;
  }
  if (action.name === "create_announcement") {
    const input = action.input as { title?: string };
    return `Post announcement: "${input.title ?? ""}"`;
  }
  if (action.name === "send_broadcast") {
    const input = action.input as { target_role?: string; method?: string; subject?: string; message?: string };
    const via = input.method === "email" ? "email" : "in-app chat";
    return `Send via ${via} to all ${input.target_role ?? "recipients"}s — "${input.subject ?? ""}": ${input.message ?? ""}`;
  }
  if (action.name === "post_forum_note") {
    const input = action.input as { title?: string; content?: string };
    return `Post to the forum: "${input.title ?? ""}" — ${input.content ?? ""}`;
  }
  return `Perform action: ${action.name}`;
}

// A small, dependency-free renderer for the light markdown Claude tends to
// produce (bold, inline code, bullet/numbered lists, paragraphs) — full
// react-markdown is overkill for replies that are meant to stay to 1-3
// sentences, and this keeps the bundle untouched.
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${keyPrefix}-${i}`} className="px-1 py-0.5 rounded bg-black/[0.06] font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

function MarkdownLite({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let listOrdered = false;

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    const Tag = listOrdered ? "ol" : "ul";
    blocks.push(
      <Tag key={key} className={`ml-4 space-y-0.5 ${listOrdered ? "list-decimal" : "list-disc"}`}>
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </Tag>
    );
    listBuffer = [];
  };

  lines.forEach((line, i) => {
    const bulletMatch = line.match(/^\s*[-•]\s+(.*)/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bulletMatch) {
      if (listOrdered) flushList(`block-${i}`);
      listOrdered = false;
      listBuffer.push(bulletMatch[1]);
      return;
    }
    if (numberedMatch) {
      if (!listOrdered) flushList(`block-${i}`);
      listOrdered = true;
      listBuffer.push(numberedMatch[1]);
      return;
    }
    flushList(`block-${i}`);
    if (line.trim() === "") {
      return;
    }
    blocks.push(<p key={`block-${i}`}>{renderInline(line, `block-${i}`)}</p>);
  });
  flushList("block-final");

  return <div className="space-y-1.5 leading-relaxed">{blocks}</div>;
}

function AgentAvatar() {
  return (
    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shrink-0 shadow-sm">
      <Sparkles className="h-3 w-3 text-white" />
    </div>
  );
}

export function AgentWidget() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [agentName, setAgentName] = useState("Solomon");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canUseAgent =
    user?.role === "admin" || user?.role === "super_admin" || user?.role === "teacher" || user?.role === "staff";

  useEffect(() => {
    if (!open || !canUseAgent) return;
    authedFetch("/api/agent/settings")
      .then((r) => r.json())
      .then((data) => { if (data.name) setAgentName(data.name); })
      .catch(() => {});
    authedFetch("/api/agent/conversations")
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages.map((m: any) => ({ id: m.id ?? crypto.randomUUID(), role: m.role, content: m.content })));
        }
      })
      .catch(() => {});
  }, [open, canUseAgent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pendingAction]);

  if (!canUseAgent) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setPendingAction(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await authedFetch("/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent request failed");

      if (data.message) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.message }]);
      }
      if (data.type === "tool_use" && data.tool) {
        setPendingAction({ name: data.tool.name, input: data.tool.input });
      }
      if (data.type === "navigate" && data.path) {
        setOpen(false);
        setLocation(data.path);
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong talking to the agent");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);
    try {
      const res = await authedFetch("/api/agent/execute-action", {
        method: "POST",
        body: JSON.stringify({ tool: pendingAction.name, input: pendingAction.input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to perform action");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: `✅ ${data.summary}` },
      ]);
      toast.success(data.summary);
    } catch (err: any) {
      toast.error(err.message || "Failed to perform action");
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  };

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-24 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-purple-500 text-white shadow-lg flex flex-col items-center justify-center gap-0.5 hover:scale-105 hover:shadow-xl transition-all duration-200"
          title={`Chat with ${agentName}`}
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-[9px] font-semibold leading-none">Sol</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-24 z-50 w-full md:w-96 h-[85vh] md:h-[600px] bg-white md:rounded-2xl shadow-2xl border border-black/5 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="relative flex items-center justify-between px-4 py-3.5 shrink-0 bg-gradient-to-r from-primary to-purple-500 text-white overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_-20%,white,transparent_60%)]" />
            <div className="relative flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-tight">{agentName}</p>
                <p className="text-[10px] text-white/70 leading-tight">AI Assistant</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="relative opacity-80 hover:opacity-100 transition-opacity">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50/50 to-white">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground mt-8 px-4">
                <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-500/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary/60" />
                </div>
                <p className="leading-relaxed">
                  Hi, I'm {agentName}. Ask me anything about your school, or ask me to draft a reminder,
                  announcement, or forum note — or just say "open analytics" to jump straight to a page.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-end gap-2 max-w-[88%] ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
              >
                {m.role === "assistant" && <AgentAvatar />}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-sm"
                      : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {m.role === "assistant" ? <MarkdownLite content={m.content} /> : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 mr-auto">
                <AgentAvatar />
                <div className="rounded-2xl rounded-bl-sm bg-white border border-gray-100 px-3.5 py-2.5 shadow-sm flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce" />
                </div>
              </div>
            )}
            {pendingAction && (
              <div className="mr-auto max-w-[92%] rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/50 p-3.5 text-sm shadow-sm">
                <p className="font-semibold text-amber-900 mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Confirm this action
                </p>
                <p className="text-amber-800/90 mb-3 leading-relaxed">{actionLabel(pendingAction)}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleConfirmAction} disabled={actionLoading} className="shadow-sm">
                    {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                    Confirm
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPendingAction(null)} disabled={actionLoading} className="bg-white/60">
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-black/5 flex items-center gap-2 shrink-0 bg-white">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={`Message ${agentName}...`}
              disabled={loading}
              className="rounded-full border-gray-200 focus-visible:ring-primary/30"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="rounded-full shrink-0 bg-gradient-to-br from-primary to-purple-500 hover:opacity-90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
