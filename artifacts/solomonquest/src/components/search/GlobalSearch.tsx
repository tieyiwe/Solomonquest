import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, UserRound, BookOpen, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface UserResult {
  type: "user";
  id: string;
  title: string;
  subtitle: string;
  role: string;
}

interface CourseResult {
  type: "course";
  id: string;
  title: string;
  subtitle: string;
}

interface SubmissionResult {
  type: "submission";
  id: string;
  title: string;
  subtitle: string;
  assignmentId: string;
  courseId: string | null;
}

interface SearchResponse {
  users: UserResult[];
  courses: CourseResult[];
  submissions: SubmissionResult[];
}

const EMPTY_RESULTS: SearchResponse = { users: [], courses: [], submissions: [] };

async function runSearch(q: string): Promise<SearchResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
  });
  if (!res.ok) return EMPTY_RESULTS;
  return res.json();
}

// Where a result navigates to depends on the viewer's own role — pages
// that would view a result are gated per-role by the router (see
// Router.tsx), so a link that's valid for an admin isn't necessarily one
// a teacher or student can open. Some combinations (e.g. a teacher
// clicking a user result) have no generic detail page anywhere in the app
// today, so those results render without a link rather than pointing
// somewhere that 403s.
function courseHref(role: string | undefined, courseId: string): string {
  if (role === "admin" || role === "super_admin") return "/dashboard/admin/courses";
  if (role === "teacher") return `/dashboard/teacher/courses/${courseId}`;
  return `/dashboard/student/courses/${courseId}`;
}

function userHref(role: string | undefined): string | null {
  if (role === "admin" || role === "super_admin") return "/dashboard/admin/users";
  return null;
}

function submissionHref(role: string | undefined, s: SubmissionResult): string | null {
  if (role === "teacher") return "/dashboard/teacher/gradebook";
  if (role === "student") return "/dashboard/student/assignments";
  return null;
}

export function GlobalSearch() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed.length < 2) {
      setResults(EMPTY_RESULTS);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const thisRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(() => {
      runSearch(trimmed)
        .then((data) => {
          if (requestIdRef.current === thisRequestId) setResults(data);
        })
        .finally(() => {
          if (requestIdRef.current === thisRequestId) setIsLoading(false);
        });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const closeAndReset = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(EMPTY_RESULTS);
  }, []);

  const go = useCallback(
    (href: string | null) => {
      if (!href) return;
      closeAndReset();
      navigate(href);
    },
    [closeAndReset, navigate]
  );

  const trimmedQuery = query.trim();
  const hasAnyResults =
    results.users.length > 0 || results.courses.length > 0 || results.submissions.length > 0;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full shrink-0"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <Search className="h-5 w-5 text-muted-foreground" />
      </Button>

      <CommandDialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeAndReset())}>
        <CommandInput
          placeholder="Search users, courses, submissions…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {trimmedQuery.length < 2 ? (
            <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : !hasAnyResults ? (
            <CommandEmpty>No results for &ldquo;{trimmedQuery}&rdquo;.</CommandEmpty>
          ) : (
            <>
              {results.users.length > 0 && (
                <CommandGroup heading="Users">
                  {results.users.map((r) => {
                    const href = userHref(user?.role);
                    return (
                      <CommandItem
                        key={`user-${r.id}`}
                        value={`user-${r.id}-${r.title}`}
                        disabled={!href}
                        onSelect={() => go(href)}
                      >
                        <UserRound className="text-muted-foreground" />
                        <div className="flex flex-col">
                          <span>{r.title}</span>
                          <span className="text-xs text-muted-foreground capitalize">{r.subtitle}</span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {results.courses.length > 0 && (
                <CommandGroup heading="Courses">
                  {results.courses.map((r) => (
                    <CommandItem
                      key={`course-${r.id}`}
                      value={`course-${r.id}-${r.title}`}
                      onSelect={() => go(courseHref(user?.role, r.id))}
                    >
                      <BookOpen className="text-muted-foreground" />
                      <div className="flex flex-col">
                        <span>{r.title}</span>
                        {r.subtitle && <span className="text-xs text-muted-foreground">{r.subtitle}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.submissions.length > 0 && (
                <CommandGroup heading="Submissions">
                  {results.submissions.map((r) => {
                    const href = submissionHref(user?.role, r);
                    return (
                      <CommandItem
                        key={`submission-${r.id}`}
                        value={`submission-${r.id}-${r.title}`}
                        disabled={!href}
                        onSelect={() => go(href)}
                      >
                        <FileText className="text-muted-foreground" />
                        <div className="flex flex-col">
                          <span>{r.title}</span>
                          {r.subtitle && <span className="text-xs text-muted-foreground">{r.subtitle}</span>}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
