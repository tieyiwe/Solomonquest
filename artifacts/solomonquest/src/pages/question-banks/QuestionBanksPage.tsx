import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Library, Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { RoleLayout } from "@/components/layout/RoleLayout";
import PageHeader from "@/components/layout/PageHeader";
import { EmptyState, LoadingRows } from "@/components/common/States";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { apiJson } from "@/lib/apiClient";
import {
  QuestionCard, fromApiQuestion, makeQuestion, questionToApiPayload, questionTypeLabels,
  type Question, type QuestionType,
} from "@/pages/teacher/TeacherQuizBuilder";
import { type BankQuestion, type BankSummary } from "@/components/quiz/QuizBankTools";

interface CourseLite { id: string; title: string; code?: string | null }
interface QuizLite { id: string; title: string }
type BankDetail = BankSummary & { questions: BankQuestion[] };

const SHARED = "__shared__";
const ALL = "__all__";

function toEditor(q: BankQuestion): Question {
  return fromApiQuestion({ ...q, correct_answer: q.correctAnswer });
}

// ─── Tag editor ─────────────────────────────────────────────────────────────

function TagEditor({ tags, onChange, disabled }: { tags: string[]; onChange: (t: string[]) => void; disabled?: boolean }) {
  const [v, setV] = useState("");
  const add = () => {
    const t = v.trim().toLowerCase().slice(0, 40);
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setV("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {tags.map((t) => (
        <Badge key={t} variant="secondary" className="gap-1 pr-1 text-xs">
          {t}
          {!disabled && (
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded hover:bg-foreground/10">
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
      {!disabled && (
        <Input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          }}
          onBlur={add}
          placeholder="Add tag"
          aria-label="Add tag"
          className="h-7 w-28 text-xs"
        />
      )}
    </div>
  );
}

// ─── One bank question (edits auto-save, debounced) ─────────────────────────

function BankQuestionItem({
  bankId, q, index, total, canEdit, onDeleted, onSaved,
}: {
  bankId: string;
  q: BankQuestion;
  index: number;
  total: number;
  canEdit: boolean;
  onDeleted: () => void;
  onSaved: (q: BankQuestion) => void;
}) {
  const [editor, setEditor] = useState<Question>(() => toEditor(q));
  const [tags, setTags] = useState<string[]>(q.tags);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = (next: Question, nextTags: string[]) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const p = questionToApiPayload(next);
        const saved = await apiJson<BankQuestion>(`/api/question-banks/${bankId}/questions/${q.id}`, {
          method: "PUT",
          json: { type: p.type, question: p.question, options: p.options, correctAnswer: p.correct_answer, points: p.points, tags: nextTags },
        });
        onSaved(saved);
      } catch (e) {
        toast.error((e as Error).message || "Failed to save question");
      }
    }, 600);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const remove = async () => {
    try {
      await apiJson(`/api/question-banks/${bankId}/questions/${q.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!canEdit) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Q{index + 1}</span>
            <Badge variant="outline" className="text-xs">{questionTypeLabels[editor.type] ?? editor.type}</Badge>
            <Badge variant="outline" className="text-xs">{editor.points} pt{editor.points === 1 ? "" : "s"}</Badge>
          </div>
          <p className="text-sm">{editor.text}</p>
          <TagEditor tags={tags} onChange={() => {}} disabled />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-1.5">
      <QuestionCard
        question={editor}
        index={index}
        total={total}
        onUpdate={(next) => { setEditor(next); save(next, tags); }}
        onDelete={remove}
        onMove={() => {}}
      />
      <div className="px-1">
        <TagEditor tags={tags} onChange={(t) => { setTags(t); save(editor, t); }} />
      </div>
    </div>
  );
}

// ─── Dialogs ────────────────────────────────────────────────────────────────

function BankFormDialog({
  open, onOpenChange, courses, initial, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courses: CourseLite[];
  initial?: BankSummary | null;
  onSaved: (b: BankSummary) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState(SHARED);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setScope(initial?.courseId ?? (courses[0]?.id ?? SHARED));
  }, [open, initial, courses]);

  const submit = async () => {
    setSaving(true);
    try {
      const b = initial
        ? await apiJson<BankSummary>(`/api/question-banks/${initial.id}`, { method: "PATCH", json: { name, description } })
        : await apiJson<BankSummary>("/api/question-banks", { method: "POST", json: { name, description, courseId: scope === SHARED ? null : scope } });
      onSaved(b);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit bank" : "New question bank"}</DialogTitle>
          <DialogDescription>Banks hold reusable questions you can add to quizzes or draw from at random.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bank-name">Name</Label>
            <Input id="bank-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Unit 3: Polynomials" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank-desc">Description (optional)</Label>
            <Textarea id="bank-desc" rows={2} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {!initial && (
            <div className="space-y-1.5">
              <Label>Belongs to</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SHARED}>Shared with the whole school</SelectItem>
                  {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}{c.code ? ` (${c.code})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{initial ? "Save" : "Create bank"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportQuizDialog({
  open, onOpenChange, bank, courses, onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bank: BankSummary;
  courses: CourseLite[];
  onImported: () => void;
}) {
  const [courseId, setCourseId] = useState("");
  const [quizId, setQuizId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) { setCourseId(bank.courseId ?? courses[0]?.id ?? ""); setQuizId(""); setTags([]); }
  }, [open, bank, courses]);
  const quizzes = useQuery({
    queryKey: ["import-quizzes", courseId],
    queryFn: () => apiJson<QuizLite[]>(`/api/quizzes?course_id=${encodeURIComponent(courseId)}`),
    enabled: open && !!courseId,
  });
  const quiz = useQuery({
    queryKey: ["import-quiz", quizId],
    queryFn: () => apiJson<{ questions: Record<string, unknown>[] }>(`/api/quizzes/${quizId}`),
    enabled: open && !!quizId,
  });
  const qs = quiz.data?.questions ?? [];
  useEffect(() => { setPicked(new Set(qs.map((q) => String(q.id)))); }, [quiz.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setSaving(true);
    try {
      const r = await apiJson<{ imported: number }>(`/api/question-banks/${bank.id}/import-quiz`, {
        method: "POST",
        json: { quizId, questionIds: Array.from(picked), tags },
      });
      toast.success(`Imported ${r.imported} question${r.imported === 1 ? "" : "s"}`);
      onImported();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from a quiz</DialogTitle>
          <DialogDescription>Copies the chosen questions (with their answers) into “{bank.name}”.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Course</Label>
            <Select value={courseId} onValueChange={(v) => { setCourseId(v); setQuizId(""); }} disabled={!!bank.courseId}>
              <SelectTrigger><SelectValue placeholder="Choose a course" /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quiz</Label>
            <Select value={quizId} onValueChange={setQuizId} disabled={!courseId}>
              <SelectTrigger><SelectValue placeholder={quizzes.data?.length === 0 ? "No quizzes" : "Choose a quiz"} /></SelectTrigger>
              <SelectContent>
                {(quizzes.data ?? []).map((q) => <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {quizId && (
          <div className="max-h-[40vh] space-y-1 overflow-y-auto rounded-md border p-2">
            {quiz.isLoading ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : qs.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">This quiz has no questions.</p>
            ) : (
              qs.map((q) => {
                const id = String(q.id);
                return (
                  <label key={id} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/60">
                    <Checkbox
                      checked={picked.has(id)}
                      onCheckedChange={() => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                      className="mt-0.5"
                    />
                    <span className="text-sm">{String(q.question ?? q.question_text ?? "") || <em className="text-muted-foreground">(no text)</em>}</span>
                  </label>
                );
              })
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Tag the imported questions (optional)</Label>
          <TagEditor tags={tags} onChange={setTags} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!quizId || picked.size === 0 || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import {picked.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bank detail ────────────────────────────────────────────────────────────

function BankDetailPanel({
  bankId, courses, onEdit, onDeleted,
}: {
  bankId: string;
  courses: CourseLite[];
  onEdit: (b: BankSummary) => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [tag, setTag] = useState(ALL);
  const [adding, setAdding] = useState<QuestionType | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: bank, isLoading } = useQuery({
    queryKey: ["qbank", bankId],
    queryFn: () => apiJson<BankDetail>(`/api/question-banks/${bankId}`),
  });
  useEffect(() => setTag(ALL), [bankId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["qbank", bankId] });
    qc.invalidateQueries({ queryKey: ["qbanks"] });
  };
  const patchLocal = (fn: (qs: BankQuestion[]) => BankQuestion[]) =>
    qc.setQueryData<BankDetail>(["qbank", bankId], (old) => (old ? { ...old, questions: fn(old.questions) } : old));

  const visible = useMemo(() => (bank?.questions ?? []).filter((q) => tag === ALL || q.tags.includes(tag)), [bank, tag]);
  const allTags = useMemo(() => Array.from(new Set((bank?.questions ?? []).flatMap((q) => q.tags))).sort(), [bank]);

  const addQuestion = async (type: QuestionType) => {
    setAdding(type);
    try {
      const p = questionToApiPayload(makeQuestion(type));
      const saved = await apiJson<BankQuestion>(`/api/question-banks/${bankId}/questions`, {
        method: "POST",
        json: { type: p.type, question: p.question, options: p.options, correctAnswer: p.correct_answer, points: p.points, tags: tag === ALL ? [] : [tag] },
      });
      patchLocal((qs) => [...qs, saved]);
      qc.invalidateQueries({ queryKey: ["qbanks"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(null);
    }
  };

  const deleteBank = async () => {
    try {
      await apiJson(`/api/question-banks/${bankId}`, { method: "DELETE" });
      toast.success("Bank deleted");
      qc.invalidateQueries({ queryKey: ["qbanks"] });
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (isLoading || !bank) return <LoadingRows rows={4} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{bank.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{bank.courseTitle ?? "Shared with school"}</Badge>
            <span>{bank.questions.length} question{bank.questions.length === 1 ? "" : "s"}</span>
          </div>
          {bank.description && <p className="mt-2 text-sm text-muted-foreground">{bank.description}</p>}
        </div>
        {bank.canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Download className="mr-1.5 h-3.5 w-3.5" /> Import from quiz</Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(bank)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete</Button>
          </div>
        )}
      </div>

      {bank.canEdit && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Add question</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(Object.entries(questionTypeLabels) as [QuestionType, string][]).map(([type, label]) => (
              <Button key={type} variant="outline" size="sm" className="h-8 text-xs" disabled={!!adding} onClick={() => addQuestion(type)}>
                {adding === type ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}{label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
          <span className="mr-1 text-xs text-muted-foreground">Filter:</span>
          {[ALL, ...allTags].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${tag === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
            >
              {t === ALL ? "All" : t}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Library}
          compact
          title={bank.questions.length === 0 ? "No questions in this bank yet" : "No questions with this tag"}
          description={bank.canEdit && bank.questions.length === 0 ? "Add a question above or import one from an existing quiz." : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((q, i) => (
            <BankQuestionItem
              key={q.id}
              bankId={bankId}
              q={q}
              index={i}
              total={visible.length}
              canEdit={bank.canEdit}
              onSaved={(saved) => patchLocal((qs) => qs.map((x) => (x.id === saved.id ? saved : x)))}
              onDeleted={() => { patchLocal((qs) => qs.filter((x) => x.id !== q.id)); qc.invalidateQueries({ queryKey: ["qbanks"] }); }}
            />
          ))}
        </div>
      )}

      <ImportQuizDialog open={importOpen} onOpenChange={setImportOpen} bank={bank} courses={courses} onImported={refresh} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{bank.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {bank.questions.length} question(s) and any random-draw rules that use it are removed. Questions already copied into quizzes stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteBank} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function QuestionBanksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [filter, setFilter] = useState(ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BankSummary | null>(null);
  const qc = useQueryClient();

  const courses = useQuery({
    queryKey: ["qb-courses", isAdmin],
    queryFn: async () => {
      const data = await apiJson<CourseLite[] | { courses: CourseLite[] }>(isAdmin ? "/api/courses" : "/api/courses/my");
      return Array.isArray(data) ? data : data.courses ?? [];
    },
  });
  const banks = useQuery({ queryKey: ["qbanks", "all"], queryFn: () => apiJson<BankSummary[]>("/api/question-banks") });

  const list = (banks.data ?? []).filter((b) =>
    filter === ALL ? true : filter === SHARED ? !b.courseId : b.courseId === filter,
  );
  useEffect(() => {
    if (!selected && list.length > 0 && typeof window !== "undefined" && window.innerWidth >= 1024) setSelected(list[0].id);
  }, [list, selected]);

  return (
    <RoleLayout>
      <PageHeader
        icon={Library}
        title="Question banks"
        description="Reusable questions for your quizzes. Add them to a quiz, or have each student draw a random set."
        actions={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-1.5 h-4 w-4" /> New bank</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className={`space-y-3 ${selected ? "hidden lg:block" : ""}`}>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger aria-label="Filter banks"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All banks</SelectItem>
              <SelectItem value={SHARED}>Shared with school</SelectItem>
              {(courses.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
          {banks.isLoading ? (
            <LoadingRows rows={3} />
          ) : banks.error ? (
            <p className="text-sm text-destructive">{(banks.error as Error).message}</p>
          ) : list.length === 0 ? (
            <EmptyState icon={Library} compact title="No banks yet" description="Create one to start collecting questions." />
          ) : (
            <div className="space-y-1.5">
              {list.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelected(b.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all ${selected === b.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{b.name}</span>
                    <Badge variant="secondary" className="shrink-0 text-xs">{b.questionCount}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{b.courseTitle ?? "Shared with school"}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={`min-w-0 ${selected ? "" : "hidden lg:block"}`}>
          {selected ? (
            <>
              <Button variant="ghost" size="sm" className="-ml-2 mb-2 lg:hidden" onClick={() => setSelected(null)}>← All banks</Button>
              <BankDetailPanel
                bankId={selected}
                courses={courses.data ?? []}
                onEdit={(b) => { setEditing(b); setFormOpen(true); }}
                onDeleted={() => setSelected(null)}
              />
            </>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground">
              <Library className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">Select a bank or create a new one</p>
            </div>
          )}
        </div>
      </div>
      <BankFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        courses={courses.data ?? []}
        initial={editing}
        onSaved={(b) => {
          qc.invalidateQueries({ queryKey: ["qbanks"] });
          qc.invalidateQueries({ queryKey: ["qbank", b.id] });
          setSelected(b.id);
        }}
      />
    </RoleLayout>
  );
}
