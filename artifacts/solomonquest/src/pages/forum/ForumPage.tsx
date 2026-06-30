import { useState, useEffect } from "react";
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
  comment_count: number;
  reaction_count: number;
  course_id: string | null;
  course_name?: string;
}

interface Course {
  id: string;
  name: string;
}

export default function ForumPage() {
  const { user } = useAuth();
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  // New topic form state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newScope, setNewScope] = useState<"school-wide" | "course">("school-wide");
  const [newCourseId, setNewCourseId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";
  const schoolId = user?.school_id;

  useEffect(() => {
    if (!schoolId) return;
    fetchTopics();
    fetchCourses();
  }, [schoolId]);

  async function fetchTopics() {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/forum/topics?school_id=${schoolId}`);
      if (!res.ok) throw new Error("Failed to fetch topics");
      const data = await res.json();
      setTopics(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load forum topics.");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchCourses() {
    try {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name")
        .eq("school_id", schoolId);
      if (error) throw error;
      setCourses(data ?? []);
    } catch {
      // non-critical
    }
  }

  async function handleCreateTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Title is required.");
      return;
    }
    if (newContent.trim().length < 20) {
      toast.error("Content must be at least 20 characters.");
      return;
    }
    if (newScope === "course" && !newCourseId) {
      toast.error("Please select a course.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        school_id: schoolId as string,
        title: newTitle.trim(),
        content: newContent.trim(),
      };
      if (newScope === "course" && newCourseId) {
        body.course_id = newCourseId;
      }
      const res = await apiFetch("/api/forum/topics", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Failed to create topic");
      }
      toast.success("Topic created successfully.");
      setDialogOpen(false);
      setNewTitle("");
      setNewContent("");
      setNewScope("school-wide");
      setNewCourseId("");
      fetchTopics();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not create topic.");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function excerpt(content: string, max = 120) {
    return content.length > max ? content.slice(0, max) + "…" : content;
  }

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "school-wide", label: "School-wide" },
    ...courses.map((c) => ({ key: c.id, label: c.name })),
  ];

  const filteredTopics = topics.filter((t) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "school-wide") return t.course_id === null;
    return t.course_id === activeFilter;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Forum</h1>
        {isTeacherOrAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>New Topic</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Topic</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateTopic} className="space-y-4 mt-2">
                {/* Scope selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium" htmlFor="new-scope">
                    Scope
                  </label>
                  <select
                    id="new-scope"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={newScope}
                    onChange={(e) =>
                      setNewScope(e.target.value as "school-wide" | "course")
                    }
                    required
                  >
                    <option value="school-wide">School-wide</option>
                    <option value="course">Course</option>
                  </select>
                </div>

                {/* Course selector (only when scope = course) */}
                {newScope === "course" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor="new-course">
                      Course
                    </label>
                    <select
                      id="new-course"
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={newCourseId}
                      onChange={(e) => setNewCourseId(e.target.value)}
                      required
                    >
                      <option value="">Select a course…</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Title */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium" htmlFor="new-title">
                    Title
                  </label>
                  <input
                    id="new-title"
                    type="text"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    placeholder="Topic title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>

                {/* Content */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium" htmlFor="new-content">
                    Content
                  </label>
                  <textarea
                    id="new-content"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[120px] resize-y"
                    placeholder="Write your topic content here… (min 20 characters)"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    required
                    minLength={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    {newContent.length} characters{" "}
                    {newContent.length < 20 && `(${20 - newContent.length} more needed)`}
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating…" : "Create Topic"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap mb-6 border-b pb-3">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              activeFilter === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Topics list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredTopics.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="mx-auto mb-3 opacity-40" size={40} />
          <p className="font-medium">No topics yet</p>
          {isTeacherOrAdmin && (
            <p className="text-sm mt-1">
              <button
                className="underline"
                onClick={() => setDialogOpen(true)}
              >
                Create the first one.
              </button>
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border bg-card">
          {filteredTopics.map((topic) => (
            <li key={topic.id}>
              <Link href={`/forum/topics/${topic.id}`}>
                <a className="flex flex-col gap-1 px-5 py-4 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-base leading-snug">
                      {topic.title}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {topic.course_id === null ? (
                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full px-2 py-0.5">
                          School-wide
                        </span>
                      ) : topic.course_name ? (
                        <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                          {topic.course_name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {topic.author_name} &middot; {formatDate(topic.created_at)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {excerpt(topic.content)}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare size={13} />
                      {topic.comment_count}{" "}
                      {topic.comment_count === 1 ? "comment" : "comments"}
                    </span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp size={13} />
                      {topic.reaction_count}{" "}
                      {topic.reaction_count === 1 ? "reaction" : "reactions"}
                    </span>
                  </div>
                </a>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
