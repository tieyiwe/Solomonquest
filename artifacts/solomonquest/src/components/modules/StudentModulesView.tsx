import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Download,
  FileQuestion,
  Layers,
  Loader2,
  Lock,
  Paperclip,
  RotateCcw,
  Video,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState, LoadingRows } from "@/components/common/States";
import { cn } from "@/lib/utils";
import { SafeMarkdown } from "./SafeMarkdown";
import { LessonVideo, parseVideoUrl } from "./LessonVideo";
import {
  ApiError,
  lessonKey,
  modulesApi,
  modulesKey,
  type CourseModule,
  type CourseProgress,
  type Lesson,
  type ModuleItem,
  type ModulesResponse,
} from "./api";

const itemIcon = { lesson: BookOpen, assignment: ClipboardList, quiz: FileQuestion } as const;
const itemLabel = { lesson: "Lesson", assignment: "Assignment", quiz: "Quiz" } as const;

export function CourseProgressSummary({ progress, className }: { progress: CourseProgress; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)} data-testid="course-progress">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Course progress</p>
        <p className="font-serif text-2xl font-semibold tabular-nums">{progress.percent}%</p>
      </div>
      <Progress value={progress.percent} className="mt-2 h-2" />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {progress.completedItems} of {progress.totalItems} items complete
        {progress.completedAt ? " · Course complete" : ""}
      </p>
    </div>
  );
}

/**
 * Student "Modules" tab: the module outline with completion + lock state,
 * and a lesson reader with prev/next navigation and "Mark complete".
 */
export function StudentModulesView({
  courseId,
  onOpenAssignment,
}: {
  courseId: string;
  onOpenAssignment?: (assignmentId: string) => void;
}) {
  const [lessonId, setLessonId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<ModulesResponse>({
    queryKey: modulesKey(courseId),
    queryFn: () => modulesApi<ModulesResponse>(`/courses/${courseId}/modules`),
    enabled: !!courseId,
  });
  const modules = data?.modules ?? [];
  const flat = useMemo(
    () => modules.flatMap((m) => m.items.map((i) => ({ item: i, module: m }))),
    [modules]
  );

  if (isLoading) return <LoadingRows rows={4} />;
  if (error) return <EmptyState compact icon={Layers} title="Modules couldn't load" description={(error as Error).message} />;
  if (modules.length === 0) {
    return <EmptyState icon={Layers} title="No modules yet" description="Your instructor hasn't published any modules for this course." />;
  }

  if (lessonId) {
    return (
      <LessonReader
        courseId={courseId}
        lessonId={lessonId}
        flat={flat}
        onNavigate={setLessonId}
        onBack={() => setLessonId(null)}
        onOpenAssignment={onOpenAssignment}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="student-modules">
      {data?.progress && <CourseProgressSummary progress={data.progress} />}
      {modules.map((m, idx) => (
        <ModuleOutline
          key={m.id}
          module={m}
          index={idx}
          onOpenLesson={setLessonId}
          onOpenAssignment={onOpenAssignment}
        />
      ))}
    </div>
  );
}

function ItemLink({
  item,
  onOpenLesson,
  onOpenAssignment,
  children,
  className,
}: {
  item: ModuleItem;
  onOpenLesson: (id: string) => void;
  onOpenAssignment?: (id: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (item.locked) {
    return (
      <div className={cn(className, "cursor-not-allowed opacity-70")} aria-disabled="true" title={item.lockReason ?? "Locked"}>
        {children}
      </div>
    );
  }
  if (item.itemType === "quiz") {
    return (
      <Link href={`/dashboard/student/quiz/${item.targetId}`} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cn(className, "w-full text-left")}
      onClick={() => (item.itemType === "lesson" ? onOpenLesson(item.targetId) : onOpenAssignment?.(item.targetId))}
    >
      {children}
    </button>
  );
}

function ModuleOutline({
  module: m,
  index,
  onOpenLesson,
  onOpenAssignment,
}: {
  module: CourseModule;
  index: number;
  onOpenLesson: (id: string) => void;
  onOpenAssignment?: (id: string) => void;
}) {
  const pct = m.totalItems ? Math.round(((m.completedItems ?? 0) / m.totalItems) * 100) : 0;
  return (
    <Card className={cn(m.locked && "bg-muted/30")} data-testid="student-module">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold">Module {index + 1}</p>
            <h3 className="font-serif text-lg font-semibold leading-tight break-words">{m.title}</h3>
            {m.description && <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>}
          </div>
          <div className="shrink-0 text-right">
            {m.locked ? (
              <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Locked</Badge>
            ) : m.completed && m.totalItems ? (
              <Badge className="gap-1 bg-success/10 text-success border border-success/30"><CheckCircle2 className="h-3 w-3" /> Done</Badge>
            ) : (
              <span className="text-xs text-muted-foreground tabular-nums">{m.completedItems ?? 0}/{m.totalItems ?? 0}</span>
            )}
          </div>
        </div>
        {m.locked && m.lockReason && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> {m.lockReason}</p>
        )}
        {!m.locked && (m.totalItems ?? 0) > 0 && <Progress value={pct} className="h-1.5" />}
      </CardHeader>
      <CardContent className="pt-0">
        {m.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {m.items.map((item) => {
              const Icon = itemIcon[item.itemType];
              return (
                <li key={item.id} data-testid="student-item">
                  <ItemLink
                    item={item}
                    onOpenLesson={onOpenLesson}
                    onOpenAssignment={onOpenAssignment}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <span className="shrink-0">
                      {item.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-success" aria-label="Complete" />
                      ) : item.locked ? (
                        <Lock className="h-5 w-5 text-muted-foreground" aria-label="Locked" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground/50" aria-label="Not started" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <Icon className="h-3 w-3" /> {itemLabel[item.itemType]}
                        {item.hasVideo && <><span>·</span><Video className="h-3 w-3" /> video</>}
                        {item.locked && item.lockReason && <span className="basis-full sm:basis-auto">· {item.lockReason}</span>}
                      </span>
                    </span>
                    {!item.locked && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </ItemLink>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function NavButton({
  entry,
  dir,
  onNavigate,
  onOpenAssignment,
}: {
  entry: { item: ModuleItem; module: CourseModule } | undefined;
  dir: "prev" | "next";
  onNavigate: (lessonId: string) => void;
  onOpenAssignment?: (id: string) => void;
}) {
  if (!entry) return <span />;
  const { item } = entry;
  const label = (
    <>
      {dir === "prev" && <ChevronLeft className="mr-1 h-4 w-4 shrink-0" />}
      <span className="min-w-0 truncate">
        <span className="hidden sm:inline">{dir === "prev" ? "Previous: " : "Next: "}</span>
        {item.title}
      </span>
      {dir === "next" && (item.locked ? <Lock className="ml-1 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="ml-1 h-4 w-4 shrink-0" />)}
    </>
  );
  const cls = cn("max-w-[48%] sm:max-w-[45%]", dir === "next" && "ml-auto");
  if (item.locked) {
    return (
      <Button variant="outline" size="sm" className={cls} disabled title={item.lockReason ?? "Locked"}>
        {label}
      </Button>
    );
  }
  if (item.itemType === "quiz") {
    return (
      <Button variant="outline" size="sm" className={cls} asChild>
        <Link href={`/dashboard/student/quiz/${item.targetId}`}>{label}</Link>
      </Button>
    );
  }
  return (
    <Button
      variant={dir === "next" ? "default" : "outline"}
      size="sm"
      className={cls}
      onClick={() => (item.itemType === "lesson" ? onNavigate(item.targetId) : onOpenAssignment?.(item.targetId))}
    >
      {label}
    </Button>
  );
}

function LessonReader({
  courseId,
  lessonId,
  flat,
  onNavigate,
  onBack,
  onOpenAssignment,
}: {
  courseId: string;
  lessonId: string;
  flat: { item: ModuleItem; module: CourseModule }[];
  onNavigate: (id: string) => void;
  onBack: () => void;
  onOpenAssignment?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [watched, setWatched] = useState(false);
  const { data: lesson, isLoading, error } = useQuery<Lesson, ApiError>({
    queryKey: lessonKey(lessonId),
    queryFn: () => modulesApi<Lesson>(`/lessons/${lessonId}`),
    retry: false,
  });

  useEffect(() => {
    setWatched(false);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }, [lessonId]);

  const idx = flat.findIndex((e) => e.item.itemType === "lesson" && e.item.targetId === lessonId);
  const here = idx >= 0 ? flat[idx] : undefined;
  const prev = idx > 0 ? flat[idx - 1] : undefined;
  const next = idx >= 0 ? flat[idx + 1] : undefined;

  const setComplete = async (complete: boolean, source: "manual" | "video" = "manual") => {
    setSaving(true);
    try {
      await modulesApi(`/lessons/${lessonId}/complete`, { method: complete ? "POST" : "DELETE", body: complete ? { source } : undefined });
      await Promise.all([
        qc.invalidateQueries({ queryKey: lessonKey(lessonId) }),
        qc.invalidateQueries({ queryKey: modulesKey(courseId) }),
        qc.invalidateQueries({ queryKey: ["my-course-progress"] }),
      ]);
      if (complete) toast.success(source === "video" ? "Video watched — lesson complete" : "Lesson marked complete");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const video = lesson?.videoUrl ? parseVideoUrl(lesson.videoUrl) : null;
  const mustWatch = !!lesson?.requireVideoWatch && video?.kind === "file";
  const canComplete = !mustWatch || watched;

  return (
    <div className="space-y-4" data-testid="lesson-reader">
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> All modules
      </Button>

      {isLoading ? (
        <LoadingRows rows={3} />
      ) : error ? (
        <EmptyState
          icon={error.status === 403 ? Lock : BookOpen}
          title={error.status === 403 ? "This lesson is locked" : "Lesson unavailable"}
          description={error.message}
          action={<Button size="sm" variant="outline" onClick={onBack}>Back to modules</Button>}
        />
      ) : lesson ? (
        <article className="space-y-5">
          <header>
            {here && <p className="text-xs font-semibold uppercase tracking-wide text-gold">{here.module.title}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-2xl font-semibold leading-tight sm:text-3xl">{lesson.title}</h2>
              {lesson.completed && (
                <Badge className="gap-1 bg-success/10 text-success border border-success/30"><CheckCircle2 className="h-3 w-3" /> Complete</Badge>
              )}
            </div>
          </header>

          {lesson.videoUrl && (
            <LessonVideo
              url={lesson.videoUrl}
              requireWatch={mustWatch}
              onWatched={
                mustWatch
                  ? () => {
                      setWatched(true);
                      if (!lesson.completed) setComplete(true, "video");
                    }
                  : undefined
              }
            />
          )}

          {lesson.body?.trim() && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <SafeMarkdown source={lesson.body} />
              </CardContent>
            </Card>
          )}

          {lesson.attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Paperclip className="h-4 w-4" /> Attachments</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {lesson.attachments.map((a) => (
                  <li key={a.url}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary/40"
                    >
                      <Download className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            {lesson.completed ? (
              <>
                <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> You've completed this lesson.</p>
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => setComplete(false)}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Mark as not complete
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {canComplete ? "Finished reading? Mark it complete to track your progress." : "Watch the whole video to complete this lesson."}
                </p>
                <Button disabled={saving || !canComplete} onClick={() => setComplete(true)} className="sm:shrink-0">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Mark complete
                </Button>
              </>
            )}
          </div>
        </article>
      ) : null}

      <nav className="flex items-center gap-2 border-t pt-4" aria-label="Lesson navigation">
        <NavButton entry={prev} dir="prev" onNavigate={onNavigate} onOpenAssignment={onOpenAssignment} />
        <NavButton entry={next} dir="next" onNavigate={onNavigate} onOpenAssignment={onOpenAssignment} />
      </nav>
    </div>
  );
}
