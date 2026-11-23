import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle, RotateCcw,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiJson } from "@/lib/apiClient";
import { downloadCsv, parseCsv } from "@/lib/csv";

const MAX_ROWS = 500;
type Kind = "students" | "courses";

interface ColumnSpec { key: string; label: string; required?: boolean; aliases: string[]; hint: string }

const COLUMNS: Record<Kind, ColumnSpec[]> = {
  students: [
    { key: "name", label: "name", required: true, aliases: ["name", "fullname", "studentname", "student"], hint: "Full name (or use first_name + last_name columns)" },
    { key: "firstName", label: "first_name", aliases: ["firstname", "first", "givenname"], hint: "Optional, instead of name" },
    { key: "lastName", label: "last_name", aliases: ["lastname", "last", "surname", "familyname"], hint: "Optional, instead of name" },
    { key: "email", label: "email", required: true, aliases: ["email", "emailaddress", "mail"], hint: "Where the invitation is sent" },
    { key: "program", label: "program", aliases: ["program", "programme", "programname", "programcode"], hint: "Optional. Program name or code; enrols them in all its courses" },
    { key: "courses", label: "courses", aliases: ["courses", "course", "coursecodes", "coursecode", "coursetitles"], hint: "Optional. Course codes or titles, separated by ;" },
  ],
  courses: [
    { key: "title", label: "title", required: true, aliases: ["title", "name", "coursetitle", "coursename", "course"], hint: "Course title" },
    { key: "code", label: "code", aliases: ["code", "coursecode"], hint: "Optional, must be unique in your school" },
    { key: "description", label: "description", aliases: ["description", "summary", "details"], hint: "Optional" },
    { key: "teacherEmail", label: "teacher_email", aliases: ["teacheremail", "teacher", "instructoremail", "instructor"], hint: "Optional. Email of a teacher already in your school" },
    { key: "program", label: "program", aliases: ["program", "programme", "programname", "programcode"], hint: "Optional. Program name or code" },
    { key: "term", label: "term", aliases: ["term", "termname", "semester", "cycle"], hint: "Optional. Matches a term by name, otherwise saved as a label" },
  ],
};

const TEMPLATES: Record<Kind, string[][]> = {
  students: [
    ["name", "email", "program", "courses"],
    ["Amara Okafor", "amara.okafor@example.com", "High School Diploma", ""],
    ["Priya Shah", "priya.shah@example.com", "", "MATH-201; HIST-110"],
  ],
  courses: [
    ["title", "code", "description", "teacher_email", "program", "term"],
    ["Algebra II", "MATH-201", "Quadratics, polynomials and functions.", "teacher@example.com", "High School Diploma", "Fall 2026"],
    ["World History", "HIST-110", "", "", "", ""],
  ],
};

interface PreviewRow {
  row: number;
  errors: string[];
  warnings: string[];
  [k: string]: unknown;
}

interface CommitResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: { row: number; label: string; success: boolean; skipped?: boolean; error?: string }[];
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

function mapRows(kind: Kind, table: string[][]): { rows: Record<string, string>[]; unknown: string[]; missing: string[] } {
  const [header, ...body] = table;
  const specs = COLUMNS[kind];
  const index: Record<string, number> = {};
  const unknown: string[] = [];
  header.forEach((h, i) => {
    const n = norm(h);
    const spec = specs.find((s) => s.aliases.includes(n));
    if (spec && index[spec.key] === undefined) index[spec.key] = i;
    else if (h.trim()) unknown.push(h.trim());
  });
  const missing = specs
    .filter((s) => s.required)
    .filter((s) => index[s.key] === undefined && !(kind === "students" && s.key === "name" && index.firstName !== undefined))
    .map((s) => s.label);
  const rows = body.map((cells) => {
    const r: Record<string, string> = {};
    for (const s of specs) if (index[s.key] !== undefined) r[s.key] = (cells[index[s.key]] ?? "").trim();
    return r;
  });
  return { rows, unknown, missing };
}

function StatusIcon({ r }: { r: PreviewRow }) {
  if (r.errors.length) return <XCircle className="h-4 w-4 text-destructive" aria-label="Error" />;
  if (r.warnings.length) return <AlertTriangle className="h-4 w-4 text-warning" aria-label="Warning" />;
  return <CheckCircle2 className="h-4 w-4 text-success" aria-label="OK" />;
}

export default function AdminBulkImport() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("students");
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<Record<string, string>[] | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState<"validate" | "commit" | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [showOnly, setShowOnly] = useState<"all" | "problems">("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName(""); setRaw(null); setPreview(null); setNotes([]); setResult(null); setShowOnly("all");
  };

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) { toast.error("That file is too large (max 5 MB)."); return; }
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) { toast.error("The file has no data rows."); return; }
    const { rows, unknown, missing } = mapRows(kind, table);
    if (missing.length) {
      toast.error(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the format.`);
      return;
    }
    if (rows.length > MAX_ROWS) {
      toast.error(`This file has ${rows.length} rows. Imports are limited to ${MAX_ROWS} rows at a time; split it into smaller files.`);
      return;
    }
    setNotes(unknown.length ? [`Ignored column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`] : []);
    setRaw(rows);
    setBusy("validate");
    try {
      const r = await apiJson<{ rows: PreviewRow[] }>(`/api/bulk-import/${kind}/validate`, { method: "POST", json: { rows } });
      setPreview(r.rows);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const valid = (preview ?? []).filter((r) => r.errors.length === 0);
  const withErrors = (preview ?? []).filter((r) => r.errors.length > 0);
  const withWarnings = (preview ?? []).filter((r) => r.errors.length === 0 && r.warnings.length > 0);

  const commit = async () => {
    if (!raw) return;
    setBusy("commit");
    try {
      const r = await apiJson<CommitResult>(`/api/bulk-import/${kind}/commit`, { method: "POST", json: { rows: raw } });
      setResult(r);
      if (kind === "courses") qc.invalidateQueries();
      toast.success(kind === "students" ? `${r.succeeded} invitation${r.succeeded === 1 ? "" : "s"} sent` : `${r.succeeded} course${r.succeeded === 1 ? "" : "s"} created`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const specs = COLUMNS[kind];
  const header = specs.filter((s) => !(kind === "students" && (s.key === "firstName" || s.key === "lastName")));

  const downloadErrors = () => {
    if (result) {
      const bad = result.results.filter((r) => !r.success);
      downloadCsv(`${kind}-import-errors.csv`, [
        ["row", ...header.map((s) => s.label), "error"],
        ...bad.map((b) => {
          const src = raw?.[b.row - 2] ?? {};
          return [b.row, ...header.map((s) => src[s.key] ?? (s.key === "name" ? `${src.firstName ?? ""} ${src.lastName ?? ""}`.trim() : "")), b.error ?? ""];
        }),
      ]);
    } else if (preview) {
      downloadCsv(`${kind}-import-errors.csv`, [
        ["row", ...header.map((s) => s.label), "error"],
        ...withErrors.map((r) => [r.row, ...header.map((s) => String(r[s.key] ?? "")), r.errors.join("; ")]),
      ]);
    }
  };

  const shown = (preview ?? []).filter((r) => showOnly === "all" || r.errors.length > 0 || r.warnings.length > 0);

  return (
    <AdminLayout>
      <PageHeader
        icon={Upload}
        title="Bulk import"
        description="Add many students or courses at once from a CSV file. Everything is checked before anything is saved."
      />

      <Tabs value={kind} onValueChange={(v) => { setKind(v as Kind); reset(); }}>
        <TabsList>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {!result && (
            <Card>
              <CardContent className="pt-6">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  data-testid="csv-input"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  {busy === "validate" ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <FileSpreadsheet className="h-8 w-8 text-primary" />}
                  <span className="font-medium">{fileName ? fileName : `Choose a ${kind} CSV file`}</span>
                  <span className="text-sm text-muted-foreground">or drag it here · up to {MAX_ROWS} rows</span>
                </button>
                {notes.map((n) => <p key={n} className="mt-3 text-xs text-muted-foreground">{n}</p>)}
              </CardContent>
            </Card>
          )}

          {preview && !result && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Check before importing</CardTitle>
                <CardDescription>
                  {kind === "students"
                    ? "Each valid row gets an email invitation to join your school. Rows with errors are skipped."
                    : "Each valid row becomes a new (unpublished) course. Rows with errors are skipped."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 text-sm" data-testid="import-summary">
                  <Badge variant="outline" className="gap-1 border-success/40 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> {valid.length} ready</Badge>
                  {withWarnings.length > 0 && <Badge variant="outline" className="gap-1 border-warning/40 text-warning"><AlertTriangle className="h-3.5 w-3.5" /> {withWarnings.length} with warnings</Badge>}
                  {withErrors.length > 0 && <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive"><XCircle className="h-3.5 w-3.5" /> {withErrors.length} with errors</Badge>}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant={showOnly === "all" ? "secondary" : "ghost"} onClick={() => setShowOnly("all")}>All rows</Button>
                    <Button size="sm" variant={showOnly === "problems" ? "secondary" : "ghost"} onClick={() => setShowOnly("problems")}>Problems</Button>
                  </div>
                </div>

                <div className="max-h-[55vh] overflow-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-10 px-3 py-2">Row</th>
                        <th className="w-8 px-1 py-2"><span className="sr-only">Status</span></th>
                        {header.map((s) => <th key={s.key} className="px-3 py-2">{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.row} className={`border-t align-top ${r.errors.length ? "bg-destructive/5" : r.warnings.length ? "bg-warning/5" : ""}`}>
                          <td className="px-3 py-2 text-muted-foreground">{r.row}</td>
                          <td className="px-1 py-2"><StatusIcon r={r} /></td>
                          {header.map((s, i) => (
                            <td key={s.key} className="max-w-[220px] px-3 py-2">
                              <div className="truncate">{String(r[s.key] ?? "") || <span className="text-muted-foreground">—</span>}</div>
                              {i === 0 && (r.errors.length > 0 || r.warnings.length > 0) && (
                                <ul className="mt-1 space-y-0.5 text-xs">
                                  {r.errors.map((e) => <li key={e} className="text-destructive">{e}</li>)}
                                  {r.warnings.map((w) => <li key={w} className="text-warning">{w}</li>)}
                                </ul>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <Button variant="ghost" onClick={reset}><RotateCcw className="mr-1.5 h-4 w-4" /> Start over</Button>
                  {withErrors.length > 0 && (
                    <Button variant="outline" onClick={downloadErrors}><Download className="mr-1.5 h-4 w-4" /> Download errors</Button>
                  )}
                  <Button onClick={commit} disabled={valid.length === 0 || busy === "commit"}>
                    {busy === "commit" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {kind === "students" ? `Invite ${valid.length} student${valid.length === 1 ? "" : "s"}` : `Create ${valid.length} course${valid.length === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {result && (
            <Card data-testid="import-result">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-5 w-5 text-success" /> Import finished
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border p-3"><div className="text-2xl font-bold text-success">{result.succeeded}</div><div className="text-xs text-muted-foreground">{kind === "students" ? "Invited" : "Created"}</div></div>
                  <div className="rounded-lg border p-3"><div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div><div className="text-xs text-muted-foreground">Skipped</div></div>
                  <div className="rounded-lg border p-3"><div className="text-2xl font-bold text-destructive">{result.failed}</div><div className="text-xs text-muted-foreground">Failed</div></div>
                </div>
                {result.results.some((r) => !r.success) && (
                  <ul className="max-h-60 space-y-1 overflow-auto rounded-lg border p-2 text-sm">
                    {result.results.filter((r) => !r.success).map((r) => (
                      <li key={r.row} className="flex gap-2"><span className="w-12 shrink-0 text-muted-foreground">Row {r.row}</span><span className="truncate font-medium">{r.label}</span><span className="text-destructive">{r.error}</span></li>
                    ))}
                  </ul>
                )}
                {kind === "students" && result.succeeded > 0 && (
                  <p className="text-sm text-muted-foreground">Invited students appear under Users → Invitations until they accept. They’re enrolled in their program and courses when they do.</p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  {result.results.some((r) => !r.success) && (
                    <Button variant="outline" onClick={downloadErrors}><Download className="mr-1.5 h-4 w-4" /> Download errors CSV</Button>
                  )}
                  <Button onClick={reset}>Import another file</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CSV format</CardTitle>
            <CardDescription>First row must be the column names.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full" onClick={() => downloadCsv(`${kind}-template.csv`, TEMPLATES[kind])}>
              <Download className="mr-1.5 h-4 w-4" /> Download {kind} template
            </Button>
            <dl className="space-y-2.5 text-sm">
              {specs.map((s) => (
                <div key={s.key}>
                  <dt className="font-mono text-xs font-semibold">{s.label}{s.required ? <span className="text-destructive"> *</span> : null}</dt>
                  <dd className="text-xs text-muted-foreground">{s.hint}</dd>
                </div>
              ))}
            </dl>
            {kind === "students" && (
              <p className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
                Students aren’t given passwords. Each one gets an invitation email and sets up their own account.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
