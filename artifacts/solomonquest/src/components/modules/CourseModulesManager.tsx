import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ClipboardList,
  FileQuestion,
  FileText,
  ImagePlus,
  Layers,
  Link2,
  ListOrdered,
  Loader2,
  Lock,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, LoadingRows } from "@/components/common/States";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { SafeMarkdown, safeImageSrc } from "./SafeMarkdown";
import { parseVideoUrl } from "./LessonVideo";
import {
  modulesApi,
  modulesKey,
  progressKey,
  type CourseModule,
  type Lesson,
  type LessonAttachment,
  type ModuleItem,
  type ModulesResponse,
  type PrerequisiteMode,
} from "./api";

const itemIcon = { lesson: BookOpen, assignment: ClipboardList, quiz: FileQuestion } as const;
const itemLabel = { lesson: "Lesson", assignment: "Assignment", quiz: "Quiz" } as const;

function swap<T>(list: T[], i: number, j: number): T[] {
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Teacher / admin editor for a course's modules, lessons and module items. */
export function CourseModulesManager({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<ModulesResponse>({
    queryKey: modulesKey(courseId),
    queryFn: () => modulesApi<ModulesResponse>(`/courses/${courseId}/modules`),
    enabled: !!courseId,
  });
  const modules = data?.modules ?? [];

  const [moduleDialog, setModuleDialog] = useState<{ open: boolean; module: CourseModule | null }>({ open: false, module: null });
  const [lessonDialog, setLessonDialog] = useState<{ open: boolean; moduleId: string; lessonId: string | null }>({
    open: false,
    moduleId: "",
    lessonId: null,
  });
  const [attachDialog, setAttachDialog] = useState<{ open: boolean; moduleId: string }>({ open: false, moduleId: "" });
  const [confirm, setConfirm] = useState<{ title: string; description: string; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: modulesKey(courseId) });
    qc.invalidateQueries({ queryKey: progressKey(courseId) });
  };

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      refresh();
    } catch (e) {
      toast.error((e as Error).message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const moveModule = (idx: number, dir: -1 | 1) => {
    const next = swap(modules, idx, idx + dir);
    qc.setQueryData<ModulesResponse>(modulesKey(courseId), (old) => (old ? { ...old, modules: next } : old));
    run(() => modulesApi(`/courses/${courseId}/modules/order`, { method: "PUT", body: { moduleIds: next.map((m) => m.id) } }));
  };

  const moveItem = (mod: CourseModule, idx: number, dir: -1 | 1) => {
    const items = swap(mod.items, idx, idx + dir);
    qc.setQueryData<ModulesResponse>(modulesKey(courseId), (old) =>
      old ? { ...old, modules: old.modules.map((m) => (m.id === mod.id ? { ...m, items } : m)) } : old
    );
    run(() => modulesApi(`/modules/${mod.id}/items/order`, { method: "PUT", body: { itemIds: items.map((i) => i.id) } }));
  };

  if (isLoading) return <LoadingRows rows={3} />;
  if (error) {
    return (
      <EmptyState
        compact
        icon={Layers}
        title="Modules couldn't load"
        description={(error as Error).message}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="modules-manager">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-serif text-xl font-semibold">Modules</h3>
          <p className="text-sm text-muted-foreground">
            Organise the course into modules of lessons, assignments and quizzes. Students only see published modules and items.
          </p>
        </div>
        <Button size="sm" onClick={() => setModuleDialog({ open: true, module: null })} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" /> New module
        </Button>
      </div>

      {modules.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No modules yet"
          description="Create the first module, then add lessons and link existing assignments or quizzes."
          action={
            <Button size="sm" onClick={() => setModuleDialog({ open: true, module: null })}>
              <Plus className="mr-2 h-4 w-4" /> Create module
            </Button>
          }
        />
      ) : (
        modules.map((mod, mIdx) => {
          const prereqTitle =
            mod.prerequisiteMode === "previous"
              ? mIdx > 0
                ? modules[mIdx - 1].title
                : null
              : mod.prerequisiteMode === "module"
                ? modules.find((m) => m.id === mod.prerequisiteModuleId)?.title ?? null
                : null;
          return (
            <Card key={mod.id} className={cn(!mod.isPublished && "border-dashed")} data-testid="module-card">
              <CardHeader className="space-y-2 pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gold">Module {mIdx + 1}</span>
                      {mod.isPublished ? (
                        <Badge className="bg-success/10 text-success border border-success/30 text-xs">Published</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Draft</Badge>
                      )}
                      {prereqTitle && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Lock className="h-3 w-3" /> Requires “{prereqTitle}”
                        </Badge>
                      )}
                    </div>
                    <h4 className="mt-1 font-serif text-lg font-semibold leading-tight break-words">{mod.title}</h4>
                    {mod.description && <p className="text-sm text-muted-foreground mt-0.5">{mod.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    <div className="flex items-center gap-2 mr-2">
                      <Switch
                        id={`pub-${mod.id}`}
                        checked={mod.isPublished}
                        disabled={busy}
                        onCheckedChange={(v) =>
                          run(() => modulesApi(`/modules/${mod.id}`, { method: "PATCH", body: { isPublished: v } }), v ? "Module published" : "Module unpublished")
                        }
                      />
                      <Label htmlFor={`pub-${mod.id}`} className="text-xs">Published</Label>
                    </div>
                    <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8" aria-label="Move module up" disabled={busy || mIdx === 0} onClick={() => moveModule(mIdx, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8" aria-label="Move module down" disabled={busy || mIdx === modules.length - 1} onClick={() => moveModule(mIdx, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8" aria-label="Edit module" onClick={() => setModuleDialog({ open: true, module: mod })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                      aria-label="Delete module"
                      onClick={() =>
                        setConfirm({
                          title: `Delete “${mod.title}”?`,
                          description: "Its lessons are deleted too. Linked assignments and quizzes are kept, just unlinked.",
                          run: () => run(() => modulesApi(`/modules/${mod.id}`, { method: "DELETE" }), "Module deleted"),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {mod.items.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    This module is empty.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {mod.items.map((item, iIdx) => (
                      <ManagerItemRow
                        key={item.id}
                        item={item}
                        index={iIdx}
                        count={mod.items.length}
                        busy={busy}
                        onMove={(dir) => moveItem(mod, iIdx, dir)}
                        onEdit={() => setLessonDialog({ open: true, moduleId: mod.id, lessonId: item.lessonId })}
                        onToggleSequential={(v) =>
                          run(() => modulesApi(`/module-items/${item.id}`, { method: "PATCH", body: { isSequential: v } }))
                        }
                        onTogglePublish={(v) =>
                          run(() => modulesApi(`/lessons/${item.lessonId}`, { method: "PATCH", body: { isPublished: v } }), v ? "Lesson published" : "Lesson unpublished")
                        }
                        onRemove={() =>
                          setConfirm({
                            title: item.itemType === "lesson" ? `Delete lesson “${item.title}”?` : `Remove “${item.title}” from this module?`,
                            description:
                              item.itemType === "lesson"
                                ? "The lesson and students' completion records for it are deleted."
                                : `The ${item.itemType} itself is not deleted.`,
                            run: () => run(() => modulesApi(`/module-items/${item.id}`, { method: "DELETE" }), "Removed"),
                          })
                        }
                      />
                    ))}
                  </ol>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setLessonDialog({ open: true, moduleId: mod.id, lessonId: null })}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add lesson
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAttachDialog({ open: true, moduleId: mod.id })}>
                    <Link2 className="mr-1.5 h-3.5 w-3.5" /> Add assignment / quiz
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {moduleDialog.open && (
        <ModuleDialog
          courseId={courseId}
          module={moduleDialog.module}
          modules={modules}
          onClose={() => setModuleDialog({ open: false, module: null })}
          onSaved={refresh}
        />
      )}
      {lessonDialog.open && (
        <LessonDialog
          courseId={courseId}
          moduleId={lessonDialog.moduleId}
          lessonId={lessonDialog.lessonId}
          onClose={() => setLessonDialog({ open: false, moduleId: "", lessonId: null })}
          onSaved={refresh}
        />
      )}
      {attachDialog.open && (
        <AttachDialog
          courseId={courseId}
          module={modules.find((m) => m.id === attachDialog.moduleId) ?? null}
          onClose={() => setAttachDialog({ open: false, moduleId: "" })}
          onSaved={refresh}
        />
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                c?.run();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ManagerItemRow({
  item,
  index,
  count,
  busy,
  onMove,
  onEdit,
  onToggleSequential,
  onTogglePublish,
  onRemove,
}: {
  item: ModuleItem;
  index: number;
  count: number;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onToggleSequential: (v: boolean) => void;
  onTogglePublish: (v: boolean) => void;
  onRemove: () => void;
}) {
  const Icon = itemIcon[item.itemType];
  return (
    <li className="rounded-lg border bg-card p-3" data-testid="module-item">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{itemLabel[item.itemType]}</span>
              {item.hasVideo && (
                <span className="inline-flex items-center gap-0.5">
                  · <Video className="h-3 w-3" /> video{item.requireVideoWatch ? " (must watch)" : ""}
                </span>
              )}
              {!item.isPublished && <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">Draft</Badge>}
              {item.isSequential && (
                <Badge variant="outline" className="h-5 gap-0.5 px-1.5 text-[11px]">
                  <ListOrdered className="h-2.5 w-2.5" /> Sequential
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:justify-end">
          {item.itemType === "lesson" && (
            <label className="mr-1 flex items-center gap-1.5 text-xs">
              <Switch checked={item.isPublished} disabled={busy} onCheckedChange={onTogglePublish} aria-label="Lesson published" />
              Published
            </label>
          )}
          <label className="mr-1 flex items-center gap-1.5 text-xs" title="Students must complete the previous item first">
            <Switch checked={item.isSequential} disabled={busy || index === 0} onCheckedChange={onToggleSequential} aria-label="Sequential" />
            Sequential
          </label>
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" aria-label="Move up" disabled={busy || index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" aria-label="Move down" disabled={busy || index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          {item.itemType === "lesson" && (
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" aria-label="Edit lesson" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7 text-destructive hover:text-destructive" aria-label="Remove" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function ModuleDialog({
  courseId,
  module,
  modules,
  onClose,
  onSaved,
}: {
  courseId: string;
  module: CourseModule | null;
  modules: CourseModule[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(module?.title ?? "");
  const [description, setDescription] = useState(module?.description ?? "");
  const [isPublished, setIsPublished] = useState(module?.isPublished ?? false);
  const [mode, setMode] = useState<PrerequisiteMode>(module?.prerequisiteMode ?? "none");
  const [prereqId, setPrereqId] = useState<string>(module?.prerequisiteModuleId ?? "");
  const [saving, setSaving] = useState(false);
  const others = modules.filter((m) => m.id !== module?.id);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Give the module a title");
      return;
    }
    if (mode === "module" && !prereqId) {
      toast.error("Choose which module must be completed first");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title,
        description: description || null,
        isPublished,
        prerequisiteMode: mode,
        prerequisiteModuleId: mode === "module" ? prereqId : null,
      };
      if (module) await modulesApi(`/modules/${module.id}`, { method: "PATCH", body });
      else await modulesApi(`/courses/${courseId}/modules`, { method: "POST", body });
      toast.success(module ? "Module saved" : "Module created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{module ? "Edit module" : "New module"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="module-title">Title</Label>
            <Input id="module-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 1: Foundations" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="module-desc">Description (optional)</Label>
            <Textarea id="module-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Prerequisite</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as PrerequisiteMode)}>
              <SelectTrigger aria-label="Prerequisite">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — always open</SelectItem>
                <SelectItem value="previous">Complete the previous module first</SelectItem>
                <SelectItem value="module" disabled={others.length === 0}>Complete a chosen module first</SelectItem>
              </SelectContent>
            </Select>
            {mode === "module" && (
              <Select value={prereqId} onValueChange={setPrereqId}>
                <SelectTrigger aria-label="Required module">
                  <SelectValue placeholder="Choose module" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isPublished} onCheckedChange={setIsPublished} /> Published (visible to students)
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Lesson images ──────────────────────────────────────────────────────────

const LESSON_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const LESSON_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const LESSON_IMAGE_MAX_SIDE = 1600;
const LESSON_IMAGE_QUALITY = 0.82;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrinks a large lesson image in the browser before it is uploaded: at most
 * 1600px on the long side, re-encoded at quality 0.82 (JPEG stays JPEG; PNG
 * and WebP become WebP so transparency survives). GIFs are left alone so
 * animations keep working, and the original is kept whenever re-encoding
 * would not make it smaller.
 */
async function shrinkLessonImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const long = Math.max(bitmap.width, bitmap.height);
    const scale = long > LESSON_IMAGE_MAX_SIDE ? LESSON_IMAGE_MAX_SIDE / long : 1;
    if (scale === 1 && file.size <= 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const out = await canvasToBlob(canvas, type, LESSON_IMAGE_QUALITY);
    if (!out || !LESSON_IMAGE_TYPES.includes(out.type)) return file;
    return scale < 1 || out.size < file.size ? out : file;
  } finally {
    bitmap.close();
  }
}

const EXT_FOR_TYPE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** Alt text and URL made safe to sit inside ![alt](url). */
function imageMarkdown(alt: string, url: string): string {
  const cleanAlt = alt.replace(/[[\]\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  const cleanUrl = url.trim().replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `![${cleanAlt}](${cleanUrl})`;
}

function LessonDialog({
  courseId,
  moduleId,
  lessonId,
  onClose,
  onSaved,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: existing, isLoading } = useQuery<Lesson>({
    queryKey: ["course-lesson-edit", lessonId],
    queryFn: () => modulesApi<Lesson>(`/lessons/${lessonId}`),
    enabled: !!lessonId,
  });
  if (lessonId && (isLoading || !existing)) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Loading lesson…</DialogTitle>
          </DialogHeader>
          <LoadingRows rows={3} />
        </DialogContent>
      </Dialog>
    );
  }
  return <LessonForm courseId={courseId} moduleId={moduleId} lesson={existing ?? null} onClose={onClose} onSaved={onSaved} />;
}

function LessonForm({
  courseId,
  moduleId,
  lesson,
  onClose,
  onSaved,
}: {
  courseId: string;
  moduleId: string;
  lesson: Lesson | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [body, setBody] = useState(lesson?.body ?? "");
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? "");
  const [requireVideoWatch, setRequireVideoWatch] = useState(lesson?.requireVideoWatch ?? false);
  const [attachments, setAttachments] = useState<LessonAttachment[]>(lesson?.attachments ?? []);
  const [isPublished, setIsPublished] = useState(lesson?.isPublished ?? false);
  const [isSequential, setIsSequential] = useState(lesson?.isSequential ?? false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [urlFormOpen, setUrlFormOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const parsed = videoUrl.trim() ? parseVideoUrl(videoUrl.trim()) : null;
  const isDirectFile = parsed?.kind === "file";

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: LessonAttachment[] = [];
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
        const path = `courses/${courseId}/lessons/${Date.now()}_${safeName}`;
        const { data, error } = await supabase.storage.from("course-resources").upload(path, file, { upsert: false });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("course-resources").getPublicUrl(data.path);
        added.push({ name: file.name, url: pub.publicUrl, size: file.size, contentType: file.type || null });
      }
      setAttachments((a) => [...a, ...added]);
      toast.success(added.length === 1 ? "File attached" : `${added.length} files attached`);
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /** Puts an image on its own line at the cursor (or the end of the text). */
  const insertAtCursor = (snippet: string) => {
    const el = bodyRef.current;
    const start = el ? el.selectionStart : body.length;
    const end = el ? el.selectionEnd : body.length;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const lead = before && !before.endsWith("\n") ? "\n\n" : before.endsWith("\n") && !before.endsWith("\n\n") ? "\n" : "";
    const trail = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    const next = before + lead + snippet + trail + after;
    setBody(next);
    const caret = (before + lead + snippet + trail).length;
    requestAnimationFrame(() => {
      if (!bodyRef.current) return;
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(caret, caret);
    });
  };

  const uploadImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (imageRef.current) imageRef.current.value = "";
    if (!file) return;
    if (!LESSON_IMAGE_TYPES.includes(file.type)) {
      toast.error("Images must be PNG, JPG, WebP or GIF");
      return;
    }
    if (file.size > LESSON_IMAGE_MAX_BYTES) {
      toast.error("Images can be at most 5 MB");
      return;
    }
    setImageUploading(true);
    try {
      const blob = await shrinkLessonImage(file);
      const type = blob.type || file.type;
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w.\- ]+/g, "_").trim().slice(0, 80) || "image";
      const path = `courses/${courseId}/lessons/images/${Date.now()}_${base.replace(/\s+/g, "_")}.${EXT_FOR_TYPE[type] ?? "img"}`;
      const { data, error } = await supabase.storage.from("course-resources").upload(path, blob, { upsert: false, contentType: type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("course-resources").getPublicUrl(data.path);
      insertAtCursor(imageMarkdown(base.replace(/_/g, " "), pub.publicUrl));
      toast.success("Image inserted");
    } catch (e) {
      toast.error((e as Error).message || "Image upload failed");
    } finally {
      setImageUploading(false);
    }
  };

  const insertImageUrl = () => {
    if (!safeImageSrc(imageUrl)) {
      toast.error("Paste a full image link that starts with https://");
      return;
    }
    insertAtCursor(imageMarkdown(imageAlt, imageUrl));
    setImageUrl("");
    setImageAlt("");
    setUrlFormOpen(false);
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error("Give the lesson a title");
      return;
    }
    if (videoUrl.trim() && !parsed) {
      toast.error("The video link must be a full http(s) URL");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        body,
        videoUrl: videoUrl.trim() || null,
        requireVideoWatch: isDirectFile && requireVideoWatch,
        attachments,
        isPublished,
        isSequential,
      };
      if (lesson) await modulesApi(`/lessons/${lesson.id}`, { method: "PATCH", body: payload });
      else await modulesApi(`/modules/${moduleId}/lessons`, { method: "POST", body: payload });
      toast.success(lesson ? "Lesson saved" : "Lesson created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{lesson ? "Edit lesson" : "New lesson"}</DialogTitle>
          <DialogDescription>Write in plain text or simple markdown (# heading, - list, **bold**, [link](https://…), ![image](https://…)).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lesson-title">Title</Label>
            <Input id="lesson-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <Tabs defaultValue="write">
            <TabsList>
              <TabsTrigger value="write">Write</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="write" className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={imageRef}
                  type="file"
                  accept={LESSON_IMAGE_TYPES.join(",")}
                  className="hidden"
                  data-testid="lesson-image-input"
                  onChange={(e) => uploadImage(e.target.files)}
                />
                <Button type="button" variant="outline" size="sm" disabled={imageUploading} onClick={() => imageRef.current?.click()}>
                  {imageUploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-2 h-3.5 w-3.5" />}
                  Insert image
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-expanded={urlFormOpen} onClick={() => setUrlFormOpen((o) => !o)}>
                  <Link2 className="mr-2 h-3.5 w-3.5" /> Image from link
                </Button>
                <span className="text-xs text-muted-foreground">PNG, JPG, WebP or GIF, up to 5 MB. Large images are resized.</span>
              </div>
              {urlFormOpen && (
                <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="lesson-image-url" className="text-xs">Image link</Label>
                    <Input id="lesson-image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/picture.png" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertImageUrl(); } }} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="lesson-image-alt" className="text-xs">Description (alt text)</Label>
                    <Input id="lesson-image-alt" value={imageAlt} maxLength={200} onChange={(e) => setImageAlt(e.target.value)} placeholder="What the image shows" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertImageUrl(); } }} />
                  </div>
                  <Button type="button" size="sm" onClick={insertImageUrl} disabled={!imageUrl.trim()}>Insert</Button>
                </div>
              )}
              <Textarea ref={bodyRef} id="lesson-body" aria-label="Lesson content" rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-sm" />
            </TabsContent>
            <TabsContent value="preview">
              <div className="min-h-[12rem] rounded-md border p-3">
                {body.trim() ? <SafeMarkdown source={body} /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
              </div>
            </TabsContent>
          </Tabs>
          <div className="space-y-1.5">
            <Label htmlFor="lesson-video">Video URL (optional)</Label>
            <Input id="lesson-video" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="YouTube, Vimeo or a direct .mp4 link" />
            {parsed && (
              <p className="text-xs text-muted-foreground">
                Detected: {parsed.kind === "youtube" ? "YouTube" : parsed.kind === "vimeo" ? "Vimeo" : "direct video file"}
              </p>
            )}
            <label className={cn("flex items-center gap-2 text-sm", !isDirectFile && "opacity-50")}>
              <Switch checked={isDirectFile && requireVideoWatch} disabled={!isDirectFile} onCheckedChange={setRequireVideoWatch} />
              Require watching the whole video (completes the lesson automatically; direct video files only)
            </label>
          </div>
          <div className="space-y-2">
            <Label>Attachments</Label>
            {attachments.length > 0 && (
              <ul className="space-y-1">
                {attachments.map((a, i) => (
                  <li key={a.url} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="text-xs text-muted-foreground">{formatSize(a.size)}</span>
                    <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-6 sm:w-6" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((list) => list.filter((_, j) => j !== i))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
              Upload files
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isPublished} onCheckedChange={setIsPublished} /> Published
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isSequential} onCheckedChange={setIsSequential} /> Sequential (previous item must be done first)
            </label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || uploading || imageUploading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save lesson
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttachDialog({
  courseId,
  module,
  onClose,
  onSaved,
}: {
  courseId: string;
  module: CourseModule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"assignment" | "quiz">("assignment");
  const [targetId, setTargetId] = useState("");
  const [isSequential, setIsSequential] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: assignments = [], isLoading: aLoading } = useQuery<{ id: string; title: string; isPublished?: boolean }[]>({
    queryKey: ["modules-attach-assignments", courseId],
    queryFn: () => modulesApi(`/courses/${courseId}/assignments`),
  });
  const { data: quizzes = [], isLoading: qLoading } = useQuery<{ id: string; title: string; is_published?: boolean }[]>({
    queryKey: ["modules-attach-quizzes", courseId],
    queryFn: () => modulesApi(`/quizzes?course_id=${courseId}`),
  });

  const already = new Set(
    (module?.items ?? []).map((i) => (kind === "assignment" ? i.assignmentId : i.quizId)).filter(Boolean) as string[]
  );
  const options = (kind === "assignment" ? assignments : quizzes).filter((o) => !already.has(o.id));

  const save = async () => {
    if (!module || !targetId) return;
    setSaving(true);
    try {
      await modulesApi(`/modules/${module.id}/items`, {
        method: "POST",
        body: { itemType: kind, assignmentId: kind === "assignment" ? targetId : undefined, quizId: kind === "quiz" ? targetId : undefined, isSequential },
      });
      toast.success(`${kind === "assignment" ? "Assignment" : "Quiz"} added to module`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Add to “{module?.title}”</DialogTitle>
          <DialogDescription>Link an existing assignment or quiz from this course.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={kind === "assignment" ? "default" : "outline"} size="sm" onClick={() => { setKind("assignment"); setTargetId(""); }}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Assignment
            </Button>
            <Button variant={kind === "quiz" ? "default" : "outline"} size="sm" onClick={() => { setKind("quiz"); setTargetId(""); }}>
              <FileQuestion className="mr-1.5 h-3.5 w-3.5" /> Quiz
            </Button>
          </div>
          {aLoading || qLoading ? (
            <LoadingRows rows={2} />
          ) : options.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {kind === "assignment" ? "assignments" : "quizzes"} left to add. Create one in its tab first.</p>
          ) : (
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger aria-label={`Choose ${kind}`}>
                <SelectValue placeholder={`Choose ${kind}`} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => {
                  const published = "isPublished" in o ? o.isPublished : (o as { is_published?: boolean }).is_published;
                  return (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title}
                      {published === false ? " (draft)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isSequential} onCheckedChange={setIsSequential} /> Sequential (previous item must be done first)
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !targetId}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
