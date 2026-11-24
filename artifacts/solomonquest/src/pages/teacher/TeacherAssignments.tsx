import { useState } from "react";
import { Link, useParams } from "wouter";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import {
  useGetMyCourses,
  useListAssignments,
  useCreateAssignment,
  useUpdateAssignment,
  useDeleteAssignment,
  useListSubmissions,
  useGradeSubmission,
  getListAssignmentsQueryKey,
} from "@workspace/api-client-react";
import type { Assignment } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Loader2,
  FileText,
  Clock,
  Users,
  Eye,
  BookOpen,
  X,
  AlertCircle,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Video,
  Lock,
  ArrowLeft,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ExtensionsPanel } from "@/components/assignments/ExtensionsPanel";

interface RubricCriterionForm {
  id: string;
  name: string;
  maxPoints: string;
}

interface AssignmentFormData {
  title: string;
  description: string;
  instructions: string;
  file_url: string;
  due_date: string;
  points: string;
  assignment_type: "standard" | "video";
  video_url: string;
  require_full_watch: boolean;
  rubric: RubricCriterionForm[];
  allow_late_submissions: boolean;
  late_penalty_per_day: string;
  late_penalty_max: string;
  late_cutoff_at: string;
}

const emptyForm: AssignmentFormData = {
  title: "",
  description: "",
  instructions: "",
  file_url: "",
  due_date: "",
  points: "100",
  assignment_type: "standard",
  video_url: "",
  require_full_watch: true,
  rubric: [],
  allow_late_submissions: true,
  late_penalty_per_day: "0",
  late_penalty_max: "100",
  late_cutoff_at: "",
};

/** ISO -> local "yyyy-MM-ddTHH:mm" for datetime-local inputs. */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd'T'HH:mm");
}

function toFormData(a: Assignment & { instructions?: string | null; fileUrl?: string | null }): AssignmentFormData {
  const rubric = (a as any).rubric as { id: string; name: string; maxPoints: number }[] | null;
  return {
    title: a.title ?? "",
    description: a.description ?? "",
    instructions: (a as any).instructions ?? "",
    file_url: (a as any).fileUrl ?? "",
    due_date: a.dueDate ? a.dueDate.slice(0, 16) : "",
    points: String(a.pointsPossible ?? 100),
    assignment_type: (a as any).assignmentType ?? "standard",
    video_url: (a as any).videoUrl ?? "",
    require_full_watch: (a as any).requireFullWatch ?? true,
    rubric: (rubric ?? []).map((c) => ({ id: c.id, name: c.name, maxPoints: String(c.maxPoints) })),
    allow_late_submissions: (a as any).allowLateSubmissions !== false,
    late_penalty_per_day: String((a as any).latePenaltyPerDay ?? 0),
    late_penalty_max: String((a as any).latePenaltyMax ?? 100),
    late_cutoff_at: isoToLocalInput((a as any).lateCutoffAt),
  };
}

function SubmissionsPanel({
  assignmentId,
  assignmentTitle,
  pointsPossible,
  dueDate,
  onClose,
}: {
  assignmentId: string;
  assignmentTitle: string;
  pointsPossible?: number | null;
  dueDate?: string | null;
  onClose: () => void;
}) {
  const { data: submissions, isLoading, refetch } = useListSubmissions(assignmentId, {
    query: { enabled: !!assignmentId },
  });
  const gradeSubmission = useGradeSubmission();

  const handleGrade = (submissionId: string, grade: number) => {
    gradeSubmission.mutate(
      { id: submissionId, data: { grade } },
      {
        onSuccess: () => {
          toast.success("Grade saved");
          refetch();
        },
        onError: () => toast.error("Failed to save grade"),
      }
    );
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">Submissions: {assignmentTitle}</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {submissions?.length ?? 0} submission{submissions?.length !== 1 ? "s" : ""}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : submissions && submissions.length > 0 ? (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Student</TableHead>
                <TableHead className="text-xs">File / Content</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs w-36">Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="text-sm font-medium py-2">
                    {sub.studentName || sub.studentId}
                  </TableCell>
                  <TableCell className="py-2">
                    {/* A file submission can also carry a note — show both. */}
                    {(sub as any).fileUrl && (
                      <a
                        href={(sub as any).fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary flex items-center gap-1 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {(sub as any).fileName || "Download"}
                      </a>
                    )}
                    {sub.content ? (
                      <span className="text-xs text-muted-foreground line-clamp-2 max-w-[180px]">
                        {sub.content}
                      </span>
                    ) : !(sub as any).fileUrl ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-col items-start gap-1">
                      <Badge
                        variant={
                          sub.status === "graded"
                            ? "default"
                            : sub.status === "submitted"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs capitalize"
                      >
                        {sub.status}
                      </Badge>
                      {(sub as any).submittedLate && (
                        <Badge variant="outline" className="text-[11px] border-warning/50 text-warning">
                          Late {(sub as any).daysLate ? `${(sub as any).daysLate}d` : ""}
                          {(sub as any).latePenaltyPercent > 0 ? ` · −${(sub as any).latePenaltyPercent}%` : ""}
                        </Badge>
                      )}
                      {(sub as any).extension && (
                        <span className="text-[11px] text-muted-foreground">
                          Ext. to {format(new Date((sub as any).extension.extendedDueAt), "MMM d")}
                          {(sub as any).extension.waivePenalty ? " (waived)" : ""}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        aria-label={`Score for ${sub.studentName || "student"} before late penalty`}
                        // The raw (pre-penalty) score — grade has any late
                        // penalty applied already; re-saving it would
                        // apply the penalty twice.
                        defaultValue={(sub as any).rawGrade ?? sub.grade ?? ""}
                        className="h-7 w-16 text-xs"
                        onBlur={(e) => {
                          if (e.target.value !== "") {
                            handleGrade(sub.id, Number(e.target.value));
                          }
                        }}
                        disabled={gradeSubmission.isPending}
                      />
                      <span className="text-xs text-muted-foreground">
                        /{pointsPossible ?? "?"}
                      </span>
                    </div>
                    {(sub as any).latePenaltyPercent > 0 && sub.grade != null && (
                      <p className="text-[11px] text-warning mt-0.5">Counts as {sub.grade}</p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        ) : (
          <div className="text-center py-6">
            <Clock className="h-7 w-7 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">No submissions yet.</p>
          </div>
        )}
        <div className="mt-4">
          <ExtensionsPanel assignmentId={assignmentId} dueDate={dueDate} onChanged={() => refetch()} />
        </div>
      </CardContent>
    </Card>
  );
}

function AssignmentFormDialog({
  open,
  onOpenChange,
  courseId,
  editAssignment,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courseId: string;
  editAssignment: (Assignment & { instructions?: string | null; fileUrl?: string | null }) | null;
  onSuccess: () => void;
}) {
  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();

  const [form, setForm] = useState<AssignmentFormData>(
    editAssignment ? toFormData(editAssignment) : emptyForm
  );

  // Reset when dialog opens/closes or editAssignment changes
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setForm(editAssignment ? toFormData(editAssignment) : emptyForm);
    }
    onOpenChange(v);
  };

  const isEditing = !!editAssignment;
  const isPending = createAssignment.isPending || updateAssignment.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (form.due_date && isNaN(Date.parse(form.due_date))) {
      toast.error("Please enter a valid due date");
      return;
    }

    const isVideo = form.assignment_type === "video";
    if (isVideo && !form.video_url.trim()) {
      toast.error("Video URL is required for video assignments");
      return;
    }

    const perDay = Number(form.late_penalty_per_day || 0);
    const maxPenalty = Number(form.late_penalty_max || 100);
    if (!Number.isFinite(perDay) || perDay < 0 || perDay > 100 || !Number.isFinite(maxPenalty) || maxPenalty < 0 || maxPenalty > 100) {
      toast.error("Late penalties must be between 0 and 100%");
      return;
    }
    if (form.late_cutoff_at && isNaN(Date.parse(form.late_cutoff_at))) {
      toast.error("Please enter a valid cutoff date");
      return;
    }
    if (form.late_cutoff_at && form.due_date && Date.parse(form.late_cutoff_at) < Date.parse(form.due_date)) {
      toast.error("The cutoff must be after the due date");
      return;
    }

    const rubricRows = form.rubric.filter((c) => c.name.trim());
    for (const c of rubricRows) {
      const max = Number(c.maxPoints);
      if (!c.name.trim() || !Number.isFinite(max) || max <= 0) {
        toast.error(`Rubric criterion "${c.name || "(unnamed)"}" needs a name and a positive point value`);
        return;
      }
    }

    const payload = {
      course_id: courseId,
      title: form.title.trim(),
      description: form.description || undefined,
      instructions: form.instructions || undefined,
      file_url: form.file_url || undefined,
      due_date: form.due_date || undefined,
      points: form.points ? Number(form.points) : undefined,
      assignment_type: form.assignment_type,
      video_url: isVideo ? form.video_url.trim() : undefined,
      require_full_watch: isVideo ? form.require_full_watch : undefined,
      rubric: rubricRows.length > 0 ? rubricRows.map((c) => ({ id: c.id, name: c.name.trim(), maxPoints: Number(c.maxPoints) })) : undefined,
      allow_late_submissions: form.allow_late_submissions,
      late_penalty_per_day: form.allow_late_submissions ? perDay : 0,
      late_penalty_max: maxPenalty,
      late_cutoff_at: form.late_cutoff_at ? new Date(form.late_cutoff_at).toISOString() : null,
    };

    if (isEditing && editAssignment) {
      updateAssignment.mutate(
        {
          id: editAssignment.id,
          data: {
            title: payload.title,
            description: payload.description,
            dueDate: payload.due_date,
            pointsPossible: payload.points,
            ...(payload as any),
          },
        },
        {
          onSuccess: () => {
            toast.success("Assignment updated");
            onOpenChange(false);
            onSuccess();
          },
          onError: () => toast.error("Failed to update assignment"),
        }
      );
    } else {
      createAssignment.mutate(
        {
          courseId,
          data: {
            title: payload.title,
            description: payload.description,
            dueDate: payload.due_date,
            pointsPossible: payload.points,
            ...(payload as any),
          },
        },
        {
          onSuccess: () => {
            toast.success("Assignment created");
            onOpenChange(false);
            onSuccess();
          },
          onError: () => toast.error("Failed to create assignment"),
        }
      );
    }
  };

  const set = (key: keyof AssignmentFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Assignment" : "Create Assignment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Assignment Type Selector */}
          <div className="space-y-1.5">
            <Label>Assignment Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["standard", "video"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, assignment_type: type }))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.assignment_type === type
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {type === "video" ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  {type === "standard" ? "Standard" : "Video Watch"}
                </button>
              ))}
            </div>
          </div>

          {/* Video URL + require full watch */}
          {form.assignment_type === "video" && (
            <div className="space-y-3 bg-muted/40 border border-dashed rounded-lg p-4">
              <div className="space-y-1.5">
                <Label htmlFor="video_url">Video URL *</Label>
                <Input
                  id="video_url"
                  type="url"
                  placeholder="https://... (direct .mp4 link, or hosted video URL)"
                  value={form.video_url}
                  onChange={set("video_url")}
                />
                <p className="text-xs text-muted-foreground">
                  Use a direct video file URL (e.g. from Supabase Storage). Skip-prevention works best with direct .mp4 links.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-warning" />
                  <div>
                    <p className="text-sm font-medium">Require full watch</p>
                    <p className="text-xs text-muted-foreground">Students cannot skip ahead or proceed until the video ends</p>
                  </div>
                </div>
                <Switch
                  checked={form.require_full_watch}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, require_full_watch: v }))}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Midterm Essay"
              value={form.title}
              onChange={set("title")}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of the assignment..."
              className="resize-none"
              rows={3}
              value={form.description}
              onChange={set("description")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              placeholder="Detailed instructions for students..."
              className="resize-none"
              rows={4}
              value={form.instructions}
              onChange={set("instructions")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="file_url">Document / File URL</Label>
            <Input
              id="file_url"
              type="url"
              placeholder="https://..."
              value={form.file_url}
              onChange={set("file_url")}
            />
            <p className="text-xs text-muted-foreground">
              Attach a link to a document, Google Drive file, or Supabase Storage URL.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="datetime-local"
                value={form.due_date}
                onChange={set("due_date")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="points">Points</Label>
              <Input
                id="points"
                type="number"
                min={0}
                value={form.points}
                onChange={set("points")}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-dashed p-4" data-testid="late-policy">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Accept late submissions</p>
                <p className="text-xs text-muted-foreground">
                  Off: nothing can be handed in after the due date (unless you grant an extension).
                </p>
              </div>
              <Switch
                aria-label="Accept late submissions"
                checked={form.allow_late_submissions}
                onCheckedChange={(v) => setForm((f) => ({ ...f, allow_late_submissions: v }))}
              />
            </div>
            {form.allow_late_submissions && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="late_penalty_per_day">Penalty per day late (%)</Label>
                  <Input
                    id="late_penalty_per_day"
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={form.late_penalty_per_day}
                    onChange={set("late_penalty_per_day")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="late_penalty_max">Maximum penalty (%)</Label>
                  <Input
                    id="late_penalty_max"
                    type="number"
                    min={0}
                    max={100}
                    value={form.late_penalty_max}
                    onChange={set("late_penalty_max")}
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="late_cutoff_at">Hard cutoff (optional)</Label>
              <Input
                id="late_cutoff_at"
                type="datetime-local"
                value={form.late_cutoff_at}
                onChange={set("late_cutoff_at")}
              />
              <p className="text-xs text-muted-foreground">
                Submissions are refused after this time. A student's extension past the cutoff still lets them submit.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Rubric (optional)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    rubric: [...f.rubric, { id: crypto.randomUUID(), name: "", maxPoints: "10" }],
                  }))
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Criterion
              </Button>
            </div>
            {form.rubric.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No rubric — this assignment grades with a single point value.
              </p>
            ) : (
              <div className="space-y-2">
                {form.rubric.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Input
                      placeholder="Criterion name (e.g. Thesis)"
                      value={c.name}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          rubric: f.rubric.map((r, ri) => (ri === i ? { ...r, name: e.target.value } : r)),
                        }))
                      }
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Pts"
                      value={c.maxPoints}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          rubric: f.rubric.map((r, ri) => (ri === i ? { ...r, maxPoints: e.target.value } : r)),
                        }))
                      }
                      className="w-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setForm((f) => ({ ...f, rubric: f.rubric.filter((_, ri) => ri !== i) }))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Total: {form.rubric.reduce((sum, c) => sum + (Number(c.maxPoints) || 0), 0)} points across{" "}
                  {form.rubric.length} criteria — grading will score each one and sum them.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Assignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CourseAssignmentsPanel({
  courseId,
  courseName,
  onEdit,
  onDelete,
}: {
  courseId: string;
  courseName: string;
  onEdit: (assignment: Assignment) => void;
  onDelete: (assignment: Assignment) => void;
}) {
  const [viewSubmissionsFor, setViewSubmissionsFor] = useState<string | null>(null);

  const { data: assignments, isLoading } = useListAssignments(courseId, {
    query: { enabled: !!courseId },
  });

  const viewingAssignment = assignments?.find((a) => a.id === viewSubmissionsFor);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="font-semibold text-sm">{courseName}</span>
        <Badge variant="outline" className="ml-1 text-xs">
          {assignments?.length ?? 0}
        </Badge>
      </div>

      <div className="pl-2 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : assignments && assignments.length > 0 ? (
          assignments.map((assignment) => (
            <Card
              key={assignment.id}
              className={cn(
                "hover:border-primary/40 transition-colors",
                viewSubmissionsFor === assignment.id && "border-primary"
              )}
            >
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm">{assignment.title}</h4>
                      {(assignment as any).assignmentType === "video" && (
                        <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                          <Video className="h-2.5 w-2.5" />
                          Video
                          {(assignment as any).requireFullWatch && <Lock className="h-2.5 w-2.5 ml-0.5" />}
                        </Badge>
                      )}
                      {!assignment.isPublished && (
                        <Badge variant="secondary" className="text-xs">
                          Draft
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {assignment.dueDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Due {format(new Date(assignment.dueDate), "MMM d, yyyy h:mm a")}
                        </span>
                      )}
                      <span>{assignment.pointsPossible ?? 0} pts</span>
                      {(assignment as any).allowLateSubmissions === false ? (
                        <span>No late work</span>
                      ) : (assignment as any).latePenaltyPerDay > 0 ? (
                        <span>
                          Late: −{(assignment as any).latePenaltyPerDay}%/day
                          {(assignment as any).latePenaltyMax < 100 ? ` (max ${(assignment as any).latePenaltyMax}%)` : ""}
                        </span>
                      ) : null}
                      {(assignment as any).lateCutoffAt && (
                        <span>Cutoff {format(new Date((assignment as any).lateCutoffAt), "MMM d, h:mm a")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(assignment)}
                      className="h-8 px-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(assignment)}
                      className="h-8 px-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant={viewSubmissionsFor === assignment.id ? "default" : "outline"}
                      onClick={() =>
                        setViewSubmissionsFor(
                          viewSubmissionsFor === assignment.id ? null : assignment.id
                        )
                      }
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      {viewSubmissionsFor === assignment.id ? "Hide" : "Submissions"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-6 border border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground">No assignments in this course.</p>
          </div>
        )}

        {viewSubmissionsFor && viewingAssignment && (
          <SubmissionsPanel
            assignmentId={viewSubmissionsFor}
            assignmentTitle={viewingAssignment.title}
            pointsPossible={viewingAssignment.pointsPossible}
            dueDate={viewingAssignment.dueDate}
            onClose={() => setViewSubmissionsFor(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function TeacherAssignments() {
  const queryClient = useQueryClient();
  // Also mounted at /dashboard/teacher/courses/:id/assignments (the course
  // page's "Assignments" link) — start filtered to that course instead of
  // ignoring the id and showing every course.
  const params = useParams<{ id?: string }>();
  const [selectedCourseId, setSelectedCourseId] = useState<string>(params.id ?? "");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);

  const { data: courses, isLoading: isCoursesLoading } = useGetMyCourses();
  const deleteAssignment = useDeleteAssignment();

  const handleCreate = () => {
    setEditAssignment(null);
    setIsFormOpen(true);
  };

  const handleEdit = (assignment: Assignment) => {
    setEditAssignment(assignment);
    setIsFormOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteAssignment.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success("Assignment deleted");
          setDeleteTarget(null);
          queryClient.invalidateQueries({ queryKey: getListAssignmentsQueryKey(deleteTarget.courseId) });
        },
        onError: () => toast.error("Failed to delete assignment"),
      }
    );
  };

  const handleFormSuccess = () => {
    const courseId = editAssignment?.courseId || selectedCourseId;
    if (courseId) {
      queryClient.invalidateQueries({ queryKey: getListAssignmentsQueryKey(courseId) });
    }
    // Invalidate all course assignment queries to be safe
    courses?.forEach((c) => {
      queryClient.invalidateQueries({ queryKey: getListAssignmentsQueryKey(c.id) });
    });
  };

  const activeCourseId = selectedCourseId || courses?.[0]?.id || "";

  return (
    <TeacherLayout>
      <div className="px-6 pt-4 pb-0">
        <Link href="/dashboard/teacher">
          <button className="flex items-center gap-1.5 min-h-10 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </Link>
      </div>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Assignments</h1>
            <p className="text-muted-foreground mt-1">
              Manage assignments and grade student submissions across all your courses.
            </p>
          </div>
          <Button onClick={handleCreate} disabled={!courses?.length}>
            <Plus className="mr-2 h-4 w-4" />
            New Assignment
          </Button>
        </div>

        {/* Course Selector */}
        {!isCoursesLoading && courses && courses.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              Filter by course:
            </label>
            <Select
              value={selectedCourseId || "__all__"}
              onValueChange={(v) => setSelectedCourseId(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="All courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All courses</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                    {(c as any).code ? ` (${(c as any).code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Summary Stats */}
        {!isCoursesLoading && courses && courses.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{courses.length}</div>
                  <div className="text-xs text-muted-foreground">Courses</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">—</div>
                  <div className="text-xs text-muted-foreground">Total Assignments</div>
                </div>
              </div>
            </Card>
            <Card className="p-4 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <div className="text-2xl font-bold">—</div>
                  <div className="text-xs text-muted-foreground">Pending Grading</div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Per-Course Assignments */}
        {isCoursesLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : courses && courses.length > 0 ? (
          <div className="space-y-6">
            {(selectedCourseId
              ? courses.filter((c) => c.id === selectedCourseId)
              : courses
            ).map((course) => (
              <CourseAssignmentsPanel
                key={course.id}
                courseId={course.id}
                courseName={course.title}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="text-center py-16">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg mb-2">No courses assigned</h3>
              <p className="text-muted-foreground text-sm">
                You need to be assigned to a course before creating assignments.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create / Edit Form Dialog */}
      {isFormOpen && (
        <AssignmentFormDialog
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          courseId={editAssignment?.courseId || activeCourseId}
          editAssignment={editAssignment}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? This action cannot be undone
              and will remove all associated submissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAssignment.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TeacherLayout>
  );
}
