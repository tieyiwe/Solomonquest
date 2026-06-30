import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MessageSquare, ThumbsUp, ArrowLeft } from "lucide-react";

async function apiFetch(url: string, options: RequestInit = {}) {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(options.headers ?? {}),
    },
  });
}

interface ForumTopic {
  id: string;
  title: string;
  content: string;
  author_name: string;
  created_at: string;
  reaction_count: number;
  course_name?: string;
}

interface ForumComment {
  id: string;
  content: string;
  author_name: string;
  created_at: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ForumTopicPage() {
  const { user } = useAuth();
  const [, params] = useRoute("/forum/topics/:id");
  const topicId = params?.id ?? "";

  const [topic, setTopic] = useState<ForumTopic | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!topicId) return;
    fetchTopic();
    fetchComments();
    subscribeToComments();
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [topicId]);

  async function fetchTopic() {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/forum/topics/${topicId}`);
      if (!res.ok) throw new Error("Failed to fetch topic");
      const data: ForumTopic = await res.json();
      setTopic(data);
      setReactionCount(data.reaction_count ?? 0);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load topic.");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchComments() {
    try {
      const res = await apiFetch(`/api/forum/topics/${topicId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data: ForumComment[] = await res.json();
      setComments(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load comments.");
    }
  }

  function subscribeToComments() {
    const channel = supabase
      .channel(`forum_comments:topic_${topicId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "forum_comments",
          filter: `topic_id=eq.${topicId}`,
        },
        (payload) => {
          const newRow = payload.new as ForumComment;
          setComments((prev) => {
            if (prev.some((c) => c.id === newRow.id)) return prev;
            return [...prev, newRow];
          });
        }
      )
      .subscribe();
    channelRef.current = channel;
  }

  async function handleReact() {
    setReacting(true);
    // Optimistic toggle
    const wasLiked = liked;
    setLiked(!wasLiked);
    setReactionCount((n) => (wasLiked ? n - 1 : n + 1));
    try {
      const res = await apiFetch(`/api/forum/topics/${topicId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ reaction: "like" }),
      });
      if (!res.ok) throw new Error("Failed to react");
      const data = await res.json();
      // Sync with server count if available
      if (typeof data.reaction_count === "number") {
        setReactionCount(data.reaction_count);
      }
    } catch (err: any) {
      // Revert optimistic update on error
      setLiked(wasLiked);
      setReactionCount((n) => (wasLiked ? n + 1 : n - 1));
      toast.error(err?.message ?? "Could not add reaction.");
    } finally {
      setReacting(false);
    }
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) {
      toast.error("Comment cannot be empty.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/forum/topics/${topicId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Failed to post comment");
      }
      setNewComment("");
      // Realtime will append the new comment; also refetch as fallback
      fetchComments();
      toast.success("Comment posted.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="space-y-4">
          <div className="h-8 w-1/2 rounded bg-muted animate-pulse" />
          <div className="h-32 rounded-lg bg-muted animate-pulse" />
          <div className="h-20 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-muted-foreground">
        <p className="font-medium mb-3">Topic not found.</p>
        <Link href="/forum">
          <a className="inline-flex items-center gap-1 text-sm underline">
            <ArrowLeft size={14} /> Back to forum
          </a>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Back link */}
      <Link href="/forum">
        <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={14} /> Back to forum
        </a>
      </Link>

      {/* Topic header + content */}
      <div className="rounded-lg border bg-card p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold leading-snug">{topic.title}</h1>
          {topic.course_name && (
            <span className="shrink-0 text-xs bg-primary/10 text-primary rounded-full px-2.5 py-0.5">
              {topic.course_name}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="font-medium text-foreground">{topic.author_name}</span>
          <span>&middot;</span>
          <span>{formatDate(topic.created_at)}</span>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{topic.content}</p>

        {/* Reaction bar */}
        <div className="flex items-center gap-2 pt-1 border-t mt-1">
          <Button
            variant={liked ? "default" : "outline"}
            size="sm"
            onClick={handleReact}
            disabled={reacting}
            className="flex items-center gap-1.5"
          >
            <ThumbsUp className="w-4 h-4" />
            <span>Like ({reactionCount})</span>
          </Button>
        </div>
      </div>

      {/* Comments section */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">
          {comments.length === 0
            ? "No comments yet"
            : `${comments.length} Comment${comments.length !== 1 ? "s" : ""}`}
        </h2>

        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Be the first to reply to this topic.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border bg-card px-4 py-3 flex gap-3"
              >
                {/* Author initials circle */}
                <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold select-none">
                  {getInitials(comment.author_name)}
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {comment.author_name}
                    </span>
                    <span>{formatDate(comment.created_at)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add comment */}
      {user && (
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Add a comment</h3>
          <form onSubmit={handleSubmitComment} className="flex flex-col gap-3">
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[100px] resize-y"
              placeholder="Write your comment…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={submitting}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={submitting || !newComment.trim()}
              >
                {submitting ? "Posting…" : "Submit"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
