import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [filterCourseId, setFilterCourseId] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCourseId, setNewCourseId] = useState<string>("none");
  const [submitting, setSubmitting] = useState(false);

  const isAdminOrTeacher =
    user?.role === "admin" || user?.role === "teacher";

  const schoolId = user?.school_id;

  useEffect(() => {
    if (!schoolId) return;
    fetchTopics();
    fetchCourses();
  }, [schoolId, filterCourseId]);

  async function fetchTopics() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ school_id: schoolId as string });
      if (filterCourseId && filterCourseId !== "all") {
        params.set("course_id", filterCourseId);
      }
      const res = await fetch(`/api/forum/topics?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch topics");
      const data = await res.json();
      setTopics(data);
    } catch (err) {
      toast.error("Could not load forum topics.");
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
      // Non-critical; swallow silently
    }
  }

  async function handleCreateTopic() {
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        school_id: schoolId as string,
        title: newTitle.trim(),
        content: newContent.trim(),
      };
      if (newCourseId && newCourseId !== "none") {
        body.course_id = newCourseId;
      }
      const res = await fetch("/api/forum/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create topic");
      toast.success("Topic created successfully.");
      setDialogOpen(false);
      setNewTitle("");
      setNewContent("");
      setNewCourseId("none");
      fetchTopics();
    } catch {
      toast.error("Could not create topic.");
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">School Forum</h1>
        {isAdminOrTeacher && (
          <Button onClick={() => setDialogOpen(true)}>New Topic</Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-muted-foreground">Filter by:</span>
        <Select value={filterCourseId} onValueChange={setFilterCourseId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All topics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">School-wide</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Topic list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading topics...
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No topics yet.{" "}
          {isAdminOrTeacher && (
            <button
              className="underline"
              onClick={() => setDialogOpen(true)}
            >
              Create the first one.
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border bg-card">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link href={`/forum/topics/${topic.id}`}>
                <a className="flex flex-col gap-1 px-5 py-4 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-base leading-tight">
                      {topic.title}
                    </span>
                    {topic.course_name && (
                      <span className="shrink-0 text-xs bg-primary/10 text-primary rounded px-2 py-0.5">
                        {topic.course_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>{topic.author_name}</span>
                    <span>{formatDate(topic.created_at)}</span>
                    <span>{topic.comment_count} comment{topic.comment_count !== 1 ? "s" : ""}</span>
                    <span>{topic.reaction_count} reaction{topic.reaction_count !== 1 ? "s" : ""}</span>
                  </div>
                </a>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* New Topic Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Forum Topic</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topic-title">Title</Label>
              <Input
                id="topic-title"
                placeholder="Topic title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topic-course">Course (optional)</Label>
              <Select value={newCourseId} onValueChange={setNewCourseId}>
                <SelectTrigger id="topic-course">
                  <SelectValue placeholder="School-wide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">School-wide</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topic-content">Content</Label>
              <Textarea
                id="topic-content"
                placeholder="Write your topic content here..."
                rows={6}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTopic} disabled={submitting}>
              {submitting ? "Creating..." : "Create Topic"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
