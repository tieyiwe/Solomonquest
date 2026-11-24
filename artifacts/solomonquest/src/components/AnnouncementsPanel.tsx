import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Megaphone, Pin, Send, Trash2 } from "lucide-react";

// GET /announcements (enrichAnnouncements in routes/announcements.ts).
interface Announcement {
  id: string;
  courseId: string | null;
  title: string;
  content: string | null;
  isPinned: boolean;
  postedBy: string | null;
  postedByName: string | null;
  createdAt: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function ago(d: string) {
  try {
    return formatDistanceToNow(parseISO(d), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * Announcements feed + composer. The API (GET/POST/DELETE /announcements)
 * existed but nothing in the app showed or posted announcements. With a
 * `courseId` it is that course's feed; without one it is the school-wide
 * feed (the API scopes what a student/parent may read).
 */
export function AnnouncementsPanel({
  courseId,
  canPost = false,
  title = "Announcements",
  limit,
}: {
  courseId?: string;
  canPost?: boolean;
  title?: string;
  limit?: number;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["announcements", courseId ?? "school"];
  const [composeTitle, setComposeTitle] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [posting, setPosting] = useState(false);

  const { data, isLoading } = useQuery<Announcement[]>({
    queryKey: key,
    queryFn: async () => {
      const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
      const res = await fetch(`/api/announcements${qs}`, { headers: await authHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const post = async () => {
    if (!composeTitle.trim()) {
      toast.error("Give the announcement a title");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ title: composeTitle.trim(), content: composeBody.trim() || null, courseId: courseId ?? null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to post announcement");
      setComposeTitle("");
      setComposeBody("");
      toast.success("Announcement posted");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to post announcement");
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/announcements/${id}`, { method: "DELETE", headers: await authHeaders() });
    if (!res.ok) {
      toast.error("Failed to delete announcement");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["announcements"] });
  };

  // School-wide view shows only school-wide items for staff (the API returns
  // every course's too for them); students already get just their own.
  const all = (data ?? []).filter((a) => courseId || !canPost || a.courseId == null);
  const items = limit ? all.slice(0, limit) : all;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canPost && (
          <div className="space-y-2 rounded-lg border p-3">
            <Input
              aria-label="Announcement title"
              placeholder="Title"
              value={composeTitle}
              onChange={(e) => setComposeTitle(e.target.value)}
              maxLength={200}
            />
            <Textarea
              aria-label="Announcement message"
              placeholder={courseId ? "Message for everyone in this course…" : "Message for the whole school…"}
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={post} disabled={posting} className="gap-1.5">
                {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Post
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No announcements yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground flex items-center gap-1.5">
                      {a.isPinned && <Pin className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Pinned" />}
                      <span className="truncate">{a.title}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.postedByName ?? "Staff"} · {ago(a.createdAt)}
                      {!courseId && a.courseId && <Badge variant="outline" className="ml-2 text-[11px] py-0">Course</Badge>}
                    </p>
                  </div>
                  {canPost && (isAdmin || a.postedBy === user?.id) && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7 shrink-0" onClick={() => remove(a.id)} aria-label="Delete announcement">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {a.content && <p className="text-sm text-foreground/90 mt-2 whitespace-pre-wrap">{a.content}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
