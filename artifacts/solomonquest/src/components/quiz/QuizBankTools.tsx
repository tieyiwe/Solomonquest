import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dices, Library, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiJson } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";

export interface BankSummary {
  id: string;
  courseId: string | null;
  courseTitle: string | null;
  name: string;
  description: string | null;
  questionCount: number;
  tags: string[];
  canEdit: boolean;
}

export interface BankQuestion {
  id: string;
  bankId: string;
  type: string;
  question: string;
  options: { id: string; text: string; is_correct?: boolean }[] | null;
  correctAnswer: unknown;
  points: number;
  tags: string[];
}

interface DrawRule {
  id: string;
  bankId: string;
  bankName: string;
  count: number;
  tag: string | null;
}

export const TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
  essay: "Essay",
  fill_blank: "Fill in the blank",
};

const ALL = "__all__";

function banksHref(role?: string | null) {
  return role === "admin" || role === "super_admin" ? "/dashboard/admin/question-banks" : "/dashboard/teacher/question-banks";
}

function AddFromBankDialog({
  open, onOpenChange, quizId, banks, onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quizId: string;
  banks: BankSummary[];
  onAdded: (rows: Record<string, unknown>[]) => void;
}) {
  const [bankId, setBankId] = useState("");
  const [tag, setTag] = useState(ALL);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const bank = useQuery({
    queryKey: ["qbank", bankId],
    queryFn: () => apiJson<BankSummary & { questions: BankQuestion[] }>(`/api/question-banks/${bankId}`),
    enabled: open && !!bankId,
  });
  useEffect(() => { if (open && !bankId && banks[0]) setBankId(banks[0].id); }, [open, banks, bankId]);
  useEffect(() => { setPicked(new Set()); setTag(ALL); }, [bankId]);

  const visible = useMemo(
    () => (bank.data?.questions ?? []).filter((q) => tag === ALL || q.tags.includes(tag)),
    [bank.data, tag],
  );
  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const submit = async () => {
    setSaving(true);
    try {
      const ordered = visible.filter((q) => picked.has(q.id)).map((q) => q.id);
      const rows = await apiJson<Record<string, unknown>[]>(`/api/quizzes/${quizId}/bank-questions`, {
        method: "POST",
        json: { bankId, questionIds: ordered },
      });
      onAdded(rows);
      toast.success(`Added ${rows.length} question${rows.length === 1 ? "" : "s"} from the bank`);
      onOpenChange(false);
      setPicked(new Set());
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
          <DialogTitle>Add questions from a bank</DialogTitle>
          <DialogDescription>The picked questions are copied into this quiz; editing them here won't change the bank.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger><SelectValue placeholder="Choose a bank" /></SelectTrigger>
              <SelectContent>
                {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.questionCount})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tag</Label>
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All tags</SelectItem>
                {(bank.data?.tags ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="max-h-[45vh] space-y-1.5 overflow-y-auto rounded-md border p-2">
          {bank.isLoading ? (
            <p className="p-4 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</p>
          ) : visible.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No questions{tag !== ALL ? " with this tag" : " in this bank yet"}.</p>
          ) : (
            <>
              <button
                type="button"
                className="px-2 py-1 text-xs font-medium text-primary hover:underline"
                onClick={() => setPicked(picked.size === visible.length ? new Set() : new Set(visible.map((q) => q.id)))}
              >
                {picked.size === visible.length ? "Clear selection" : `Select all ${visible.length}`}
              </button>
              {visible.map((q) => (
                <label key={q.id} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/60">
                  <Checkbox checked={picked.has(q.id)} onCheckedChange={() => toggle(q.id)} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{q.question || <span className="italic text-muted-foreground">(no text)</span>}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[11px]">{TYPE_LABELS[q.type] ?? q.type}</Badge>
                      <Badge variant="outline" className="text-[11px]">{q.points} pt{q.points === 1 ? "" : "s"}</Badge>
                      {q.tags.map((t) => <Badge key={t} variant="secondary" className="text-[11px]">{t}</Badge>)}
                    </div>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={picked.size === 0 || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add {picked.size || ""} question{picked.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quiz-builder panel: "Add from bank" (copy specific questions in) and
 * "Random draw" rules (N random questions per attempt, chosen by the server
 * when each attempt starts).
 */
export function QuizBankTools({
  quizId, courseId, onQuestionsAdded,
}: {
  quizId: string;
  courseId: string;
  onQuestionsAdded: (rows: Record<string, unknown>[]) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pickOpen, setPickOpen] = useState(false);
  const [drawBank, setDrawBank] = useState("");
  const [drawCount, setDrawCount] = useState("5");
  const [drawTag, setDrawTag] = useState(ALL);
  const [adding, setAdding] = useState(false);

  const banks = useQuery({
    queryKey: ["qbanks", courseId],
    queryFn: () => apiJson<BankSummary[]>(`/api/question-banks?courseId=${encodeURIComponent(courseId)}`),
  });
  const draws = useQuery({
    queryKey: ["quiz-draws", quizId],
    queryFn: () => apiJson<DrawRule[]>(`/api/quizzes/${quizId}/draws`),
  });
  const bankList = banks.data ?? [];
  const selectedBank = bankList.find((b) => b.id === drawBank);
  const totalDrawn = (draws.data ?? []).reduce((s, d) => s + d.count, 0);

  const addDraw = async () => {
    setAdding(true);
    try {
      await apiJson(`/api/quizzes/${quizId}/draws`, {
        method: "POST",
        json: { bankId: drawBank, count: Number(drawCount), tag: drawTag === ALL ? null : drawTag },
      });
      toast.success("Random draw added");
      qc.invalidateQueries({ queryKey: ["quiz-draws", quizId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  };
  const removeDraw = async (id: string) => {
    try {
      await apiJson(`/api/quizzes/${quizId}/draws/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["quiz-draws", quizId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card data-testid="quiz-bank-tools">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><Library className="h-4 w-4" /> Question banks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {banks.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading banks…</p>
        ) : bankList.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No question banks for this course yet.{" "}
            <Link href={banksHref(user?.role)} className="font-medium text-primary hover:underline">Create one</Link>
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPickOpen(true)}>
                <Plus className="mr-1 h-3 w-3" /> Add from bank
              </Button>
              <span className="text-xs text-muted-foreground">Copy specific questions into this quiz.</span>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Dices className="h-4 w-4" /> Random draw</div>
              <p className="text-xs text-muted-foreground">
                Each student gets a fresh random set when they start an attempt. Answers are never sent to students.
              </p>
              {(draws.data ?? []).length > 0 && (
                <ul className="space-y-1.5">
                  {(draws.data ?? []).map((d) => (
                    <li key={d.id} className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm">
                      <span className="flex-1 min-w-0 truncate">
                        <strong>{d.count}</strong> from <strong>{d.bankName}</strong>{d.tag ? <> tagged <Badge variant="secondary" className="ml-0.5 text-[11px]">{d.tag}</Badge></> : null}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove draw" onClick={() => removeDraw(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                  <li className="text-xs text-muted-foreground">+{totalDrawn} random question{totalDrawn === 1 ? "" : "s"} per attempt</li>
                </ul>
              )}
              <div className="grid gap-2 sm:grid-cols-[1fr_90px_1fr_auto]">
                <Select value={drawBank} onValueChange={(v) => { setDrawBank(v); setDrawTag(ALL); }}>
                  <SelectTrigger className="h-9" aria-label="Bank to draw from"><SelectValue placeholder="Bank…" /></SelectTrigger>
                  <SelectContent>
                    {bankList.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.questionCount})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  type="number" min={1} max={100} value={drawCount} aria-label="Number of questions"
                  onChange={(e) => setDrawCount(e.target.value)} className="h-9"
                />
                <Select value={drawTag} onValueChange={setDrawTag} disabled={!selectedBank}>
                  <SelectTrigger className="h-9" aria-label="Only questions tagged"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any tag</SelectItem>
                    {(selectedBank?.tags ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-9" onClick={addDraw} disabled={!drawBank || adding || !(Number(drawCount) >= 1)}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add draw"}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
      <AddFromBankDialog open={pickOpen} onOpenChange={setPickOpen} quizId={quizId} banks={bankList} onAdded={onQuestionsAdded} />
    </Card>
  );
}
