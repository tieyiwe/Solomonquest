import { Link } from "wouter";
import { useQueries } from "@tanstack/react-query";
import { useGetMyCourses } from "@workspace/api-client-react";
import { StudentLayout } from "@/components/layout/StudentLayout";
import PageHeader from "@/components/layout/PageHeader";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Clock, FileQuestion } from "lucide-react";

// Raw quizzes rows from GET /quizzes?course_id= (students only get
// published ones).
interface QuizRow {
  id: string;
  course_id: string;
  title: string;
  description?: string | null;
  time_limit_minutes?: number | null;
  attempt_limit?: number | null;
}

async function fetchQuizzes(courseId: string): Promise<QuizRow[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/quizzes?course_id=${encodeURIComponent(courseId)}`, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (!res.ok) return [];
  return res.json();
}

/**
 * Every published quiz across the student's courses. The sidebar's
 * "Quizzes" link used to render the Assignments page, which lists no
 * quizzes at all — quizzes were only reachable from inside each course.
 */
export default function StudentQuizzes() {
  const { data: courses, isLoading: coursesLoading } = useGetMyCourses();
  const courseList = courses ?? [];
  const results = useQueries({
    queries: courseList.map((c) => ({
      queryKey: ["course-quizzes", c.id],
      queryFn: () => fetchQuizzes(c.id),
    })),
  });

  const loading = coursesLoading || results.some((r) => r.isLoading);
  const groups = courseList
    .map((c, i) => ({ course: c, quizzes: (results[i]?.data ?? []) as QuizRow[] }))
    .filter((g) => g.quizzes.length > 0);

  return (
    <StudentLayout>
      <div className="space-y-6">
        <PageHeader title="Quizzes" icon={ClipboardList} description="Published quizzes from all of your courses." />

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : groups.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
              <FileQuestion className="h-10 w-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
              <p className="font-medium text-foreground">No quizzes yet</p>
              <p className="text-sm text-muted-foreground mt-1">When your teachers publish a quiz, it will show up here.</p>
            </CardContent>
          </Card>
        ) : (
          groups.map(({ course, quizzes }) => (
            <section key={course.id} className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{course.title}</h2>
              {quizzes.map((quiz) => (
                <Card key={quiz.id} className="hover:border-primary/40 transition-colors">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{quiz.title}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                        {quiz.time_limit_minutes ? (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{quiz.time_limit_minutes} min</span>
                        ) : null}
                        {quiz.attempt_limit ? <span>{quiz.attempt_limit} attempt{quiz.attempt_limit === 1 ? "" : "s"}</span> : null}
                      </div>
                    </div>
                    <Button size="sm" asChild className="shrink-0">
                      <Link href={`/dashboard/student/quiz/${quiz.id}`}>Open</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </section>
          ))
        )}
      </div>
    </StudentLayout>
  );
}
