import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { modulesApi, type CourseProgress } from "./api";

type MyProgressRow = CourseProgress & { courseId: string };

/** One shared GET /progress/my for every course card on the page. */
export function useMyCourseProgress() {
  return useQuery<MyProgressRow[]>({
    queryKey: ["my-course-progress"],
    queryFn: () => modulesApi<MyProgressRow[]>("/progress/my"),
    staleTime: 60_000,
    retry: false,
  });
}

/** Compact completion bar for a student's course card. Renders nothing
 *  when the course has no published module items. */
export function MyCourseProgressBar({ courseId, className }: { courseId: string; className?: string }) {
  const { data } = useMyCourseProgress();
  const row = data?.find((r) => r.courseId === courseId);
  if (!row || row.totalItems === 0) return null;
  return (
    <div className={cn("space-y-1", className)} data-testid="card-progress">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{row.completedAt ? "Completed" : "Progress"}</span>
        <span className="font-semibold tabular-nums text-foreground">{row.percent}%</span>
      </div>
      <Progress value={row.percent} className="h-1.5" aria-label={`Course progress ${row.percent}%`} />
    </div>
  );
}
