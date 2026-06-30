import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp } from "lucide-react";

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
      }
    };
  }, [topicId]);

  async function fetchTopic() {
    try {
      const res = await fetch(`/api/forum/topics/${topicId}`);
      if (!res.ok) throw new Error("Failed to fetch topic");
      const data = await res.json();
      setTopic(data);
      setReactionCount(data.reaction_count ?? 0);
    } catch {
      toast.error("Could not load topic.");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchComments() {
    try {
      const res = await fetch(`/api/forum/topics/${topicId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data = await res.json();
      setComments(data);
    } catch {
      toast.error("Could not load comments.");
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
            // Avoid duplicates if the comment was already added optimistically
            if (prev.some((c) => c.id === newRow.id)) return prev;
            return [...prev, newRow];
          });
        }
      )
      .subscribe();
    channelRef.current = channel;
  }

  async function handleSubmitComment() {
    if (!newComment.trim()) {
      toast.error("Comment cannot be empty.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forum/topics/${topicId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      setNewComment("");
      // Realtime will append; also refetch as fallback
      fetchComments();
    } catch {
      toast.error("Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReact() {
    setReacting(true);
    try {
      const res = await fetch(`/api/forum/topics/${topicId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction: "like" }),
      });
      if (!res.ok) throw new Error("Failed to react");
      const data = await res.json();
      setReactionCount(data.reaction_count ?? reactionCount + 1);
      toast.success("Reaction added.");
    } catch {
      toast.error("Could not add reaction.");
    } finally {
      setReacting(false);
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
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-muted-foreground">
        Loading topic...
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-muted-foreground">
        Topic not found.{" "}
        <Link href="/forum">
          <a className="underline">Back to forum</a>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Back link */}
      <Link href="/forum">
        <a className="text-sm text-muted-foreground hover:underline">&larr; Back to forum</a>
      </Link>

      {/* Topic header */}
      <div className="rounded-lg border bg-card p-6 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold leading-tight">{topic.title}</h1>
          {topic.course_name && (
            <span className="shrink-0 text-xs bg-primary/10 text-primary rounded px-2 py-0.5">
              {topic.course_name}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex gap-3">
          <span>{topic.author_name}</span>
          <span>{formatDate(topic.created_at)}</span>
        </div>
        <div className="text-sm whitespace-pre-wrap mt-1">{topic.content}</div>
        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReact}
            disabled={reacting}
            className="flex items-center gap-1.5"
          >
            <ThumbsUp className="w-4 h-4" />
            <span>{reactionCount}</span>
          </Button>
        </div>
      </div>

      {/* Comments */}
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">
          {comments.length} Comment{comments.length !== 1 ? "s" : ""}
        </h2>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet. Be the first to reply.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-1"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {comment.author_name}
                  </span>
                  <span>{formatDate(comment.created_at)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add comment */}
      {user && (
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Add a Comment</h3>
          <Textarea
            placeholder="Write your comment..."
            rows={4}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              onClick={handleSubmitComment}
              disabled={submitting || !newComment.trim()}
            >
              {submitting ? "Posting..." : "Post Comment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
