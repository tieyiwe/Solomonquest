import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award, CheckCircle2, Copy, ExternalLink, ImagePlus, Loader2, Palette, Plus, Search, ShieldOff, Trash2, Sparkles,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import PageHeader from "@/components/layout/PageHeader";
import { EmptyState, LoadingRows } from "@/components/common/States";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { apiJson } from "@/lib/apiClient";
import { CertificateView, formatCertDate, renderCertificateTemplate, verifyUrlFor } from "@/components/certificates/CertificateView";
import type { CertificateSignatory } from "@/components/certificates/CertificateView";
import {
  PLACEHOLDERS, awardName, type Certificate, type CertificateSettings, type PendingCertificate,
} from "@/components/certificates/certApi";

const GOLD = "#c9a054";
const DEFAULT_BODY =
  "This is to certify that {studentName} has successfully completed {courseName} at {schoolName}, awarded on {date}.";
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Uploads to school-assets/school-logos/<schoolId>/<name>.<ext> (the only
 *  path admins may write per storage-buckets.sql) and returns a fresh URL. */
async function uploadSchoolAsset(schoolId: string, name: string, file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Use a PNG, JPG, WebP or GIF image");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller");
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `school-logos/${schoolId}/${name}.${ext}`;
  const { error } = await supabase.storage.from("school-assets").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("school-assets").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

function ImagePickButton({
  label, onPick, busy, disabled,
}: { label: string; onPick: (f: File) => void; busy?: boolean; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy || disabled} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}
        {label}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

type Draft = {
  enabled: boolean;
  logoUrl: string | null;
  title: string;
  bodyTemplate: string;
  signatories: CertificateSignatory[];
  accentColor: string;
  issueMode: "approval" | "auto";
  passPercent: number;
};

function draftFrom(s: CertificateSettings): Draft {
  return {
    enabled: s.configured ? s.enabled : true,
    logoUrl: s.logoUrl,
    title: s.title,
    bodyTemplate: s.bodyTemplate || DEFAULT_BODY,
    signatories: s.signatories.length ? s.signatories : [{ name: "", title: "Principal", signatureUrl: null }],
    accentColor: s.accentColor || GOLD,
    issueMode: s.issueMode,
    passPercent: s.passPercent,
  };
}

function SettingsTab({ settings }: { settings: CertificateSettings }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(settings));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const schoolName = settings.school?.name || "Your School";

  useEffect(() => setDraft(draftFrom(settings)), [settings]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setSig = (i: number, patch: Partial<CertificateSignatory>) =>
    setDraft((d) => ({ ...d, signatories: d.signatories.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const insertPlaceholder = (p: string) => {
    const el = bodyRef.current;
    const v = draft.bodyTemplate;
    const start = el?.selectionStart ?? v.length;
    const end = el?.selectionEnd ?? v.length;
    set("bodyTemplate", v.slice(0, start) + p + v.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + p.length, start + p.length);
    });
  };

  const upload = async (key: string, name: string, file: File, apply: (url: string) => void) => {
    setUploading(key);
    try {
      apply(await uploadSchoolAsset(settings.schoolId, name, file));
      toast.success("Image uploaded. Save to apply it.");
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiJson("/api/certificates/settings", {
        method: "PUT",
        json: {
          ...draft,
          signatories: draft.signatories.filter((s) => s.name.trim() || s.title.trim() || s.signatureUrl),
        },
      });
      toast.success(draft.enabled ? "Certificate settings saved. Certificates can now be issued." : "Certificate settings saved.");
      qc.invalidateQueries({ queryKey: ["cert-settings"] });
      qc.invalidateQueries({ queryKey: ["cert-pending"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sampleDate = formatCertDate(new Date());
  const preview = {
    title: draft.title || "Certificate of Completion",
    body: renderCertificateTemplate(draft.bodyTemplate, {
      studentName: "Amara Okafor",
      courseName: "Algebra II",
      programName: "High School Diploma",
      schoolName,
      date: sampleDate,
    }),
    studentName: "Amara Okafor",
    schoolName,
    logoUrl: draft.logoUrl,
    accentColor: draft.accentColor,
    signatories: draft.signatories.filter((s) => s.name.trim() || s.title.trim() || s.signatureUrl),
    issuedAt: new Date().toISOString(),
    verificationCode: "SQ-SAMP-LE00-0000",
    verifyUrl: verifyUrlFor("SQ-SAMP-LE00-0000"),
  };

  const swatches = [
    { label: "Gold", value: GOLD },
    ...(settings.school?.secondaryColor ? [{ label: "School accent", value: settings.school.secondaryColor }] : []),
    ...(settings.school?.primaryColor ? [{ label: "School colour", value: settings.school.primaryColor }] : []),
  ].filter((s, i, a) => /^#[0-9a-fA-F]{6}$/.test(s.value) && a.findIndex((x) => x.value.toLowerCase() === s.value.toLowerCase()) === i);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="space-y-5 min-w-0">
        <Card>
          <CardContent className="flex items-start justify-between gap-4 pt-6">
            <div>
              <Label htmlFor="cert-enabled" className="text-sm font-semibold">Issue certificates</Label>
              <p className="mt-1 text-xs text-muted-foreground">When off, no certificates are issued (existing ones stay valid).</p>
            </div>
            <Switch id="cert-enabled" checked={draft.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Logo</CardTitle>
            <CardDescription>Shown at the top of every certificate. Defaults to your school logo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <div className="flex h-16 w-28 items-center justify-center rounded-md border bg-muted/40">
              {draft.logoUrl ? <img src={draft.logoUrl} alt="Certificate logo" className="max-h-14 max-w-24 object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <ImagePickButton
                label="Upload logo"
                busy={uploading === "logo"}
                onPick={(f) => upload("logo", "certificate-logo", f, (url) => set("logoUrl", url))}
              />
              {settings.school?.logoUrl && draft.logoUrl !== settings.school.logoUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set("logoUrl", settings.school!.logoUrl)}>Use school logo</Button>
              )}
              {draft.logoUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set("logoUrl", null)}>Remove</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Wording</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cert-title">Certificate title</Label>
              <Input id="cert-title" value={draft.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-body">Body text</Label>
              <Textarea id="cert-body" ref={bodyRef} rows={4} maxLength={1000} value={draft.bodyTemplate} onChange={(e) => set("bodyTemplate", e.target.value)} />
              <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Insert a placeholder">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => insertPlaceholder(p)}
                    className="rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-[11px] text-foreground hover:border-gold hover:bg-gold/10"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Tap a placeholder to insert it. For a program certificate, {"{courseName}"} shows the program name.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Signatories</CardTitle>
            <CardDescription>Up to two people who sign the certificate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {draft.signatories.map((s, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signatory {i + 1}</span>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove signatory ${i + 1}`}
                    onClick={() => set("signatories", draft.signatories.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`sig-name-${i}`} className="text-xs">Name</Label>
                    <Input id={`sig-name-${i}`} value={s.name} maxLength={120} placeholder="Dr. Jane Mensah" onChange={(e) => setSig(i, { name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`sig-title-${i}`} className="text-xs">Title</Label>
                    <Input id={`sig-title-${i}`} value={s.title} maxLength={120} placeholder="Principal" onChange={(e) => setSig(i, { title: e.target.value })} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {s.signatureUrl && (
                    <div className="flex h-10 w-28 items-center justify-center rounded border bg-white">
                      <img src={s.signatureUrl} alt="Signature" className="max-h-9 max-w-26 object-contain" />
                    </div>
                  )}
                  <ImagePickButton
                    label={s.signatureUrl ? "Replace signature" : "Upload signature (optional)"}
                    busy={uploading === `sig${i}`}
                    onPick={(f) => upload(`sig${i}`, `certificate-signature-${i + 1}`, f, (url) => setSig(i, { signatureUrl: url }))}
                  />
                  {s.signatureUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSig(i, { signatureUrl: null })}>Remove</Button>
                  )}
                </div>
              </div>
            ))}
            {draft.signatories.length < 2 && (
              <Button type="button" variant="outline" size="sm" onClick={() => set("signatories", [...draft.signatories, { name: "", title: "", signatureUrl: null }])}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add signatory
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4" /> Accent colour</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {swatches.map((s) => (
              <button
                key={s.value}
                type="button"
                title={s.label}
                aria-label={`${s.label} ${s.value}`}
                onClick={() => set("accentColor", s.value)}
                className={`h-9 w-9 rounded-full border-2 ${draft.accentColor.toLowerCase() === s.value.toLowerCase() ? "border-foreground" : "border-transparent"} ring-1 ring-border`}
                style={{ background: s.value }}
              />
            ))}
            <input
              type="color"
              aria-label="Custom colour"
              value={/^#[0-9a-fA-F]{6}$/.test(draft.accentColor) ? draft.accentColor : GOLD}
              onChange={(e) => set("accentColor", e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border bg-transparent"
            />
            <Input aria-label="Hex colour" className="w-28 font-mono" value={draft.accentColor} maxLength={7} onChange={(e) => set("accentColor", e.target.value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Issuing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={draft.issueMode} onValueChange={(v) => set("issueMode", v as Draft["issueMode"])} className="space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[button[data-state=checked]]:border-primary">
                <RadioGroupItem value="approval" id="mode-approval" className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">An admin approves each certificate</div>
                  <div className="text-xs text-muted-foreground">Students who complete a course appear under “Pending approval”. Recommended.</div>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[button[data-state=checked]]:border-primary">
                <RadioGroupItem value="auto" id="mode-auto" className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Issue automatically on completion</div>
                  <div className="text-xs text-muted-foreground">The certificate is issued as soon as a student completes the course.</div>
                </div>
              </label>
            </RadioGroup>
            <div className="space-y-1.5">
              <Label htmlFor="cert-pass">Pass mark (%)</Label>
              <Input id="cert-pass" type="number" min={0} max={100} className="w-28" value={draft.passPercent} onChange={(e) => set("passPercent", Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">
                A course counts as completed when every published assignment is submitted and graded and the course grade is at least this.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
          <Button onClick={save} disabled={saving || !!uploading} size="lg" className="shadow-lg">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save certificate settings
          </Button>
        </div>
      </div>

      <div className="min-w-0">
        <div className="xl:sticky xl:top-20 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Live preview</h2>
            <span className="text-xs text-muted-foreground">Sample student and course</span>
          </div>
          <div data-testid="cert-preview">
            <CertificateView data={preview} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending approval
// ---------------------------------------------------------------------------

function PendingTab({ ready }: { ready: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cert-pending"],
    queryFn: () => apiJson<{ pending: PendingCertificate[] }>("/api/certificates/pending"),
    enabled: ready,
  });

  if (!ready) return <SetupPrompt compact />;
  if (isLoading) return <LoadingRows rows={4} />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  const rows = data?.pending ?? [];
  if (rows.length === 0) {
    return <EmptyState icon={CheckCircle2} title="Nothing waiting for approval" description="Students appear here once they complete a course and pass." />;
  }

  const approve = async (p: PendingCertificate) => {
    const k = `${p.studentId}:${p.courseId}`;
    setBusy(k);
    try {
      await apiJson("/api/certificates/issue", { method: "POST", json: { studentId: p.studentId, courseId: p.courseId, approved: true } });
      toast.success(`Certificate issued to ${p.studentName}`);
      qc.invalidateQueries({ queryKey: ["cert-pending"] });
      qc.invalidateQueries({ queryKey: ["cert-list"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      {rows.map((p) => {
        const k = `${p.studentId}:${p.courseId}`;
        return (
          <div key={k} className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.studentName}</div>
              <div className="truncate text-sm text-muted-foreground">
                {p.courseTitle}{p.courseCode ? ` · ${p.courseCode}` : ""}{p.studentEmail ? ` · ${p.studentEmail}` : ""}
              </div>
            </div>
            {p.finalPercent != null && <Badge variant="outline" className="w-fit">{Math.round(p.finalPercent)}%</Badge>}
            <Button size="sm" onClick={() => approve(p)} disabled={busy === k}>
              {busy === k ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Award className="mr-1.5 h-3.5 w-3.5" />}
              Approve &amp; issue
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issued
// ---------------------------------------------------------------------------

interface Person { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }
interface CourseLite { id: string; title: string; code?: string | null }
interface ProgramLite { id: string; name: string }

function IssueDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"course" | "program">("course");
  const [targetId, setTargetId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [saving, setSaving] = useState(false);
  const courses = useQuery({ queryKey: ["cert-courses"], queryFn: () => apiJson<CourseLite[]>("/api/courses"), enabled: open });
  const programs = useQuery({ queryKey: ["cert-programs"], queryFn: () => apiJson<ProgramLite[]>("/api/programs"), enabled: open });
  const students = useQuery({
    queryKey: ["cert-students", kind, targetId],
    queryFn: () =>
      kind === "course" && targetId
        ? apiJson<Person[]>(`/api/courses/${targetId}/students`)
        : apiJson<Person[]>("/api/users?role=student"),
    enabled: open && (kind === "program" || !!targetId),
  });

  useEffect(() => { setStudentId(""); }, [kind, targetId]);
  useEffect(() => { if (!open) { setTargetId(""); setStudentId(""); } }, [open]);

  const submit = async () => {
    setSaving(true);
    try {
      await apiJson("/api/certificates/issue", {
        method: "POST",
        json: kind === "course" ? { studentId, courseId: targetId } : { studentId, programId: targetId },
      });
      toast.success("Certificate issued");
      qc.invalidateQueries({ queryKey: ["cert-list"] });
      qc.invalidateQueries({ queryKey: ["cert-pending"] });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const personName = (p: Person) => `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email || "Student";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue a certificate</DialogTitle>
          <DialogDescription>Issue manually, for example for work completed outside the platform.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={kind} onValueChange={(v) => { setKind(v as "course" | "program"); setTargetId(""); }} className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="course" /> Course</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="program" /> Program</label>
          </RadioGroup>
          <div className="space-y-1.5">
            <Label>{kind === "course" ? "Course" : "Program"}</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger><SelectValue placeholder={`Choose a ${kind}…`} /></SelectTrigger>
              <SelectContent>
                {kind === "course"
                  ? (courses.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.title}{c.code ? ` (${c.code})` : ""}</SelectItem>)
                  : (programs.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Student</Label>
            <Select value={studentId} onValueChange={setStudentId} disabled={kind === "course" && !targetId}>
              <SelectTrigger><SelectValue placeholder={kind === "course" && !targetId ? "Choose a course first" : "Choose a student…"} /></SelectTrigger>
              <SelectContent>
                {(students.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{personName(p)}</SelectItem>)}
              </SelectContent>
            </Select>
            {kind === "course" && targetId && students.data && students.data.length === 0 && (
              <p className="text-xs text-muted-foreground">No students are enrolled in this course.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!studentId || !targetId || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Issue certificate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ cert, onClose }: { cert: Certificate | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setReason(""), [cert]);
  const submit = async () => {
    if (!cert) return;
    setSaving(true);
    try {
      await apiJson(`/api/certificates/${cert.id}/revoke`, { method: "POST", json: { reason } });
      toast.success("Certificate revoked. The verification page now shows it as revoked.");
      qc.invalidateQueries({ queryKey: ["cert-list"] });
      qc.invalidateQueries({ queryKey: ["cert-pending"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={!!cert} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke certificate?</DialogTitle>
          <DialogDescription>
            {cert ? `${cert.studentName}, ${awardName(cert)}. ` : ""}Anyone checking its verification code will see it as revoked. This can’t be undone, but you can issue a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="revoke-reason">Reason (internal, optional)</Label>
          <Textarea id="revoke-reason" rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssuedTab({ ready }: { ready: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "valid" | "revoked">("all");
  const [issueOpen, setIssueOpen] = useState(false);
  const [revoking, setRevoking] = useState<Certificate | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cert-list"],
    queryFn: () => apiJson<Certificate[]>("/api/certificates"),
  });
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (c) =>
        (status === "all" || c.status === status) &&
        (!needle || [c.studentName, awardName(c), c.verificationCode].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [data, q, status]);

  const copy = (c: Certificate) => {
    navigator.clipboard?.writeText(verifyUrlFor(c.verificationCode)).then(
      () => toast.success("Verification link copied"),
      () => toast.error("Couldn't copy the link"),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, course or code" className="pl-9" aria-label="Search certificates" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="sm:w-36" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="valid">Valid</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setIssueOpen(true)} disabled={!ready}>
          <Plus className="mr-1.5 h-4 w-4" /> Issue certificate
        </Button>
      </div>
      {!ready && <SetupPrompt compact />}
      {isLoading ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Award} title={data?.length ? "No certificates match" : "No certificates issued yet"} compact />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{c.studentName}</span>
                  {c.status === "revoked" ? <Badge variant="destructive">Revoked</Badge> : <Badge variant="outline" className="border-success/40 text-success">Valid</Badge>}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {awardName(c)} · {formatCertDate(c.issuedAt)} · <span className="font-mono text-xs">{c.verificationCode}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/certificates/${c.id}`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copy(c)}><Copy className="mr-1.5 h-3.5 w-3.5" /> Link</Button>
                {c.status === "valid" && (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRevoking(c)}>
                    <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Revoke
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} />
      <RevokeDialog cert={revoking} onClose={() => setRevoking(null)} />
    </div>
  );
}

function SetupPrompt({ compact = false, onSetup }: { compact?: boolean; onSetup?: () => void }) {
  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-gold/50 bg-gold/10 ${compact ? "p-4" : "p-5"} sm:flex-row sm:items-center`} role="status">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/20 text-foreground">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="font-semibold">Set up your certificate</div>
        <p className="text-sm text-muted-foreground">
          Confirm your logo, wording and signatories, turn certificates on and save. Nothing is issued to students until you do.
        </p>
      </div>
      {onSetup && <Button onClick={onSetup}>Set up now</Button>}
    </div>
  );
}

export default function AdminCertificates() {
  const [tab, setTab] = useState("settings");
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ["cert-settings"],
    queryFn: () => apiJson<CertificateSettings>("/api/certificates/settings"),
  });
  const ready = !!settings?.configured && !!settings?.enabled;

  return (
    <AdminLayout>
      <PageHeader
        icon={Award}
        title="Certificates"
        description="Design your school's certificate and issue it to students who complete their courses."
      />
      {isLoading ? (
        <LoadingRows rows={5} />
      ) : error || !settings ? (
        <EmptyState icon={Award} title="Couldn't load certificate settings" description={(error as Error)?.message} />
      ) : (
        <div className="space-y-5">
          {!settings.configured && <SetupPrompt onSetup={() => setTab("settings")} />}
          {settings.configured && !settings.enabled && (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              Certificates are turned off. Turn them on under Design &amp; settings to issue new ones.
            </p>
          )}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
              <TabsTrigger value="settings">Design &amp; settings</TabsTrigger>
              <TabsTrigger value="pending">Pending approval</TabsTrigger>
              <TabsTrigger value="issued">Issued</TabsTrigger>
            </TabsList>
            <TabsContent value="settings" className="mt-5"><SettingsTab settings={settings} /></TabsContent>
            <TabsContent value="pending" className="mt-5"><PendingTab ready={ready} /></TabsContent>
            <TabsContent value="issued" className="mt-5"><IssuedTab ready={ready} /></TabsContent>
          </Tabs>
        </div>
      )}
    </AdminLayout>
  );
}
