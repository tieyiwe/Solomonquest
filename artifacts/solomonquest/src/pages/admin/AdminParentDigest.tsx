import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, CalendarClock, History, Loader2, Mail, MailCheck, RefreshCw, Send, Users } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import PageHeader from "@/components/layout/PageHeader";
import { HelpLink } from "@/help/components/HelpLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { apiJson, ApiError } from "@/lib/apiClient";

// ─── Types (camelCase, as /api/parent-digest returns them) ──────────────────

type Frequency = "manual" | "weekly" | "biweekly" | "monthly";
type Audience = "all" | "programs" | "courses";

interface Include {
  grades: boolean;
  attendance: boolean;
  missingLate: boolean;
  completion: boolean;
  upcoming: boolean;
  announcements: boolean;
}

interface DigestSettings {
  enabled: boolean;
  frequency: Frequency;
  weekday: number;
  dayOfMonth: number;
  sendTime: string;
  timezone: string | null;
  include: Include;
  message: string | null;
  audience: Audience;
  audienceProgramIds: string[];
  audienceCourseIds: string[];
  nextRunAt: string | null;
  lastRunAt: string | null;
  stored: boolean;
  smtpConfigured: boolean;
  messageMax: number;
  sendNowRetryAfterMs: number;
}

interface Options {
  students: { id: string; name: string; parentCount: number }[];
  programs: { id: string; name: string }[];
  courses: { id: string; title: string; programId: string | null }[];
}

interface Preview {
  parentName: string | null;
  parentCount: number;
  parentOptedOut: boolean;
  children: { studentId: string; name: string }[];
  email: { subject: string; html: string };
  inApp: { title: string; body: string; link: string };
}

interface Run {
  id: string;
  trigger: "manual" | "scheduled";
  triggeredByName: string | null;
  scheduledFor: string | null;
  status: "running" | "completed" | "failed";
  recipients: number;
  inAppSent: number;
  emailsSent: number;
  emailsFailed: number;
  skippedOptedOut: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface AudienceCount {
  parents: number;
  students: number;
  optedOut: number;
}

type Form = Pick<
  DigestSettings,
  "enabled" | "frequency" | "weekday" | "dayOfMonth" | "sendTime" | "timezone" | "include" | "message" | "audience" | "audienceProgramIds" | "audienceCourseIds"
>;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const INCLUDE_ITEMS: { key: keyof Include; label: string; hint: string }[] = [
  { key: "grades", label: "Grades per course", hint: "Each course's grade with a plain-language cue." },
  { key: "attendance", label: "Attendance", hint: "Attendance rate with present, late and absent counts." },
  { key: "missingLate", label: "Missing and late work", hint: "Work that's overdue or was handed in late." },
  { key: "completion", label: "Course completion", hint: "How much of each course's modules they've finished." },
  { key: "upcoming", label: "Due in the next 7 days", hint: "Assignments coming up that aren't handed in yet." },
  { key: "announcements", label: "Recent announcements", hint: "School-wide and class announcements since the last digest." },
];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function allTimezones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  if (!zones.includes("UTC")) zones = ["UTC", ...zones];
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}

function formatInZone(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz ?? undefined,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function toForm(s: DigestSettings): Form {
  return {
    enabled: s.enabled,
    frequency: s.frequency,
    weekday: s.weekday,
    dayOfMonth: s.dayOfMonth,
    sendTime: s.sendTime,
    timezone: s.timezone ?? browserTimezone(),
    include: { ...s.include },
    message: s.message ?? "",
    audience: s.audience,
    audienceProgramIds: [...s.audienceProgramIds],
    audienceCourseIds: [...s.audienceCourseIds],
  };
}

function scheduleSummary(f: Form): string {
  const at = (() => {
    const [h, m] = f.sendTime.split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  })();
  if (f.frequency === "manual") return "Only when you press Send now";
  if (f.frequency === "weekly") return `Every ${WEEKDAYS[f.weekday]} at ${at}`;
  if (f.frequency === "biweekly") return `Every other ${WEEKDAYS[f.weekday]} at ${at}`;
  return `On day ${f.dayOfMonth} of each month at ${at}${f.dayOfMonth > 28 ? " (or the last day in shorter months)" : ""}`;
}

const nativeSelect =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminParentDigest() {
  const [settings, setSettings] = useState<DigestSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [studentId, setStudentId] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [audience, setAudience] = useState<AudienceCount | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await apiJson<Run[]>("/api/parent-digest/runs"));
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s, o] = await Promise.all([
          apiJson<DigestSettings>("/api/parent-digest/settings"),
          apiJson<Options>("/api/parent-digest/options"),
        ]);
        setSettings(s);
        setForm(toForm(s));
        setOptions(o);
        const firstWithParent = o.students.find((x) => x.parentCount > 0) ?? o.students[0];
        if (firstWithParent) setStudentId(firstWithParent.id);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load the digest settings");
      }
    })();
    loadRuns();
  }, [loadRuns]);

  // Keep the history fresh while a send is in progress.
  useEffect(() => {
    if (!runs?.some((r) => r.status === "running")) return;
    const t = setTimeout(loadRuns, 3000);
    return () => clearTimeout(t);
  }, [runs, loadRuns]);

  const savedForm = useMemo(() => (settings ? toForm(settings) : null), [settings]);
  const dirty = !!form && !!savedForm && (JSON.stringify(form) !== JSON.stringify(savedForm) || !settings?.stored);

  const update = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const settingsBody = (f: Form) => ({
    enabled: f.enabled,
    frequency: f.frequency,
    weekday: f.weekday,
    dayOfMonth: f.dayOfMonth,
    sendTime: f.sendTime,
    timezone: f.timezone,
    include: f.include,
    message: f.message ?? "",
    audience: f.audience,
    audienceProgramIds: f.audienceProgramIds,
    audienceCourseIds: f.audienceCourseIds,
  });

  // Preview follows the form (unsaved changes included), debounced.
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!form || !studentId) return;
    const seq = ++previewSeq.current;
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const p = await apiJson<Preview>("/api/parent-digest/preview", { method: "POST", json: { studentId, settings: settingsBody(form) } });
        if (seq === previewSeq.current) setPreview(p);
      } catch (e) {
        if (seq === previewSeq.current) setPreviewError(e instanceof Error ? e.message : "Preview failed");
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false);
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, studentId]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const s = await apiJson<DigestSettings>("/api/parent-digest/settings", { method: "PUT", json: settingsBody(form) });
      setSettings(s);
      setForm(toForm(s));
      toast.success(s.enabled && s.nextRunAt ? `Saved. Next digest: ${formatInZone(s.nextRunAt, s.timezone)}` : "Digest settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!form) return;
    setTesting(true);
    try {
      const r = await apiJson<{ email: "sent" | "not_configured" | "no_address" | "failed"; to: string | null }>("/api/parent-digest/test", {
        method: "POST",
        json: { studentId: studentId || undefined, settings: settingsBody(form) },
      });
      if (r.email === "sent") toast.success(`Test digest sent to ${r.to}. It's in your notifications too.`);
      else if (r.email === "not_configured") toast.success("Email isn't set up on this server, so the test went to your in-app notifications.");
      else if (r.email === "no_address") toast.warning("Your account has no email address. The test is in your in-app notifications.");
      else toast.error("The test email couldn't be sent. Check the SMTP settings. It's in your notifications.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the test");
    } finally {
      setTesting(false);
    }
  };

  const openSendNow = async () => {
    setConfirmOpen(true);
    setAudience(null);
    setAudienceLoading(true);
    try {
      setAudience(await apiJson<AudienceCount>("/api/parent-digest/audience"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not count recipients");
    } finally {
      setAudienceLoading(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const r = await apiJson<{ runId: string; recipients: number }>("/api/parent-digest/send-now", { method: "POST", json: {} });
      toast.success(`Sending to ${r.recipients} parent${r.recipients === 1 ? "" : "s"}. Progress shows in the history below.`);
      setConfirmOpen(false);
      setSettings((s) => (s ? { ...s, sendNowRetryAfterMs: 10 * 60_000 } : s));
      loadRuns();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
      if (e instanceof ApiError && e.status === 429) setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  };

  const zones = useMemo(() => allTimezones(form?.timezone ?? browserTimezone()), [form?.timezone]);
  const messageMax = settings?.messageMax ?? 1000;

  return (
    <AdminLayout>
      <PageHeader
        icon={Mail}
        title="Parent digest"
        description="A friendly progress update for parents: grades, attendance and what's coming up. You choose what's in it and when it goes out."
        actions={<HelpLink slug="admin-parent-digest" label="How the parent digest works" />}
      />

      {loadError && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {!form || !settings || !options ? (
        !loadError && (
          <div className="grid gap-5 xl:grid-cols-2">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        )
      ) : (
        <>
          {!settings.smtpConfigured && (
            <Alert className="mb-5">
              <AlertDescription>
                Email isn't set up on this server yet, so parents will get the digest in the app only (the bell). Ask your platform administrator to configure email.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* ── Settings ── */}
            <div className="min-w-0 space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarClock className="h-4 w-4" aria-hidden="true" /> Schedule
                  </CardTitle>
                  <CardDescription>{scheduleSummary(form)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div>
                      <Label htmlFor="digest-enabled" className="font-medium">
                        Parent digest is {form.enabled ? "on" : "off"}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {form.enabled ? "Scheduled digests go out automatically." : "Nothing goes out on a schedule. You can still preview and send manually."}
                      </p>
                    </div>
                    <Switch id="digest-enabled" checked={form.enabled} onCheckedChange={(v) => update("enabled", v)} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="digest-frequency">How often</Label>
                      <select id="digest-frequency" className={nativeSelect} value={form.frequency} onChange={(e) => update("frequency", e.target.value as Frequency)}>
                        <option value="manual">Manual only</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Every two weeks</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    {(form.frequency === "weekly" || form.frequency === "biweekly") && (
                      <div className="space-y-1.5">
                        <Label htmlFor="digest-weekday">Day</Label>
                        <select id="digest-weekday" className={nativeSelect} value={form.weekday} onChange={(e) => update("weekday", Number(e.target.value))}>
                          {WEEKDAYS.map((d, i) => (
                            <option key={d} value={i}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {form.frequency === "monthly" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="digest-day">Day of the month</Label>
                        <select id="digest-day" className={nativeSelect} value={form.dayOfMonth} onChange={(e) => update("dayOfMonth", Number(e.target.value))}>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {form.frequency !== "manual" && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="digest-time">Time</Label>
                          <Input id="digest-time" type="time" value={form.sendTime} onChange={(e) => e.target.value && update("sendTime", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="digest-tz">Time zone</Label>
                          <select id="digest-tz" className={nativeSelect} value={form.timezone ?? ""} onChange={(e) => update("timezone", e.target.value)}>
                            {zones.map((z) => (
                              <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                  {form.frequency === "monthly" && form.dayOfMonth > 28 && (
                    <p className="text-xs text-muted-foreground">In months without day {form.dayOfMonth}, it goes out on the last day of the month.</p>
                  )}
                  <p className="text-sm text-muted-foreground" data-testid="digest-next-run">
                    {settings.enabled && settings.nextRunAt
                      ? <>Next digest: <strong className="text-foreground">{formatInZone(settings.nextRunAt, settings.timezone)}</strong> ({settings.timezone?.replace(/_/g, " ")})</>
                      : settings.stored
                      ? "No digest is scheduled."
                      : "Not set up yet. Save to start."}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">What's included</CardTitle>
                  <CardDescription>Turn off anything you'd rather not share in the digest. Each child's section also gets a status: On track, Worth a look or Needs attention.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {INCLUDE_ITEMS.map((item) => (
                    <div key={item.key} className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Label htmlFor={`inc-${item.key}`} className="text-sm font-medium">{item.label}</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.hint}</p>
                      </div>
                      <Switch
                        id={`inc-${item.key}`}
                        checked={form.include[item.key]}
                        onCheckedChange={(v) => update("include", { ...form.include, [item.key]: v })}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4" aria-hidden="true" /> Message and audience
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="digest-message">Personal message from the school (optional)</Label>
                    <Textarea
                      id="digest-message"
                      rows={4}
                      maxLength={messageMax}
                      placeholder="e.g. Parent evenings are on Thursday from 5pm. We'd love to see you!"
                      value={form.message ?? ""}
                      onChange={(e) => update("message", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground flex justify-between gap-2">
                      <span>Plain text. It appears at the top of every digest.</span>
                      <span aria-live="polite">{(form.message ?? "").length} / {messageMax}</span>
                    </p>
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium mb-1">Who gets it</legend>
                    <RadioGroup value={form.audience} onValueChange={(v) => update("audience", v as Audience)} className="gap-2">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="all" id="aud-all" />
                        <Label htmlFor="aud-all" className="font-normal">All parents</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="programs" id="aud-programs" disabled={options.programs.length === 0} />
                        <Label htmlFor="aud-programs" className="font-normal">Parents of students in selected programs</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="courses" id="aud-courses" disabled={options.courses.length === 0} />
                        <Label htmlFor="aud-courses" className="font-normal">Parents of students in selected courses</Label>
                      </div>
                    </RadioGroup>
                    {form.audience !== "all" && (
                      <div className="mt-2 max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                        {(form.audience === "programs"
                          ? options.programs.map((p) => ({ id: p.id, label: p.name }))
                          : options.courses.map((c) => ({ id: c.id, label: c.title }))
                        ).map((o) => {
                          const key = form.audience === "programs" ? "audienceProgramIds" : "audienceCourseIds";
                          const list = form[key];
                          const checked = list.includes(o.id);
                          return (
                            <div key={o.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`aud-${o.id}`}
                                checked={checked}
                                onCheckedChange={(v) => update(key, v ? [...list, o.id] : list.filter((x) => x !== o.id))}
                              />
                              <Label htmlFor={`aud-${o.id}`} className="font-normal">{o.label}</Label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Parents with several children get one digest with a section for each child.</p>
                  </fieldset>
                </CardContent>
              </Card>

              <div className="sticky bottom-20 md:bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur">
                {dirty && <span className="mr-auto text-sm text-muted-foreground">You have unsaved changes</span>}
                <Button onClick={save} disabled={saving || !dirty}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save settings
                </Button>
              </div>
            </div>

            {/* ── Preview & send ── */}
            <div className="min-w-0 space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Preview</CardTitle>
                  <CardDescription>Pick a student to see exactly what their parent would get, with your changes applied.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {options.students.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Your school has no students yet, so there's nothing to preview.</p>
                  ) : (
                    <>
                      <div className="flex items-end gap-2">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <Label htmlFor="digest-student">Student</Label>
                          <select id="digest-student" className={nativeSelect} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                            {options.students.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}{s.parentCount === 0 ? " (no parent linked)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        {previewLoading && <Loader2 className="mb-3 h-4 w-4 animate-spin text-muted-foreground" aria-label="Updating preview" />}
                      </div>

                      {preview && (
                        <p className="text-sm text-muted-foreground" data-testid="digest-preview-recipient">
                          {preview.parentName
                            ? <>Goes to <strong className="text-foreground">{preview.parentName}</strong>{preview.parentCount > 1 ? ` (and ${preview.parentCount - 1} other linked parent${preview.parentCount > 2 ? "s" : ""}, each with their own copy)` : ""}{preview.children.length > 1 ? `. Covers ${preview.children.map((c) => c.name).join(" and ")}.` : "."}</>
                            : "No parent is linked to this student yet. This is how their digest would look."}
                          {preview.parentOptedOut && <> <Badge variant="outline" className="ml-1">Turned off by this parent</Badge></>}
                        </p>
                      )}
                      {previewError && <p className="text-sm text-destructive">{previewError}</p>}

                      <Tabs defaultValue="email">
                        <TabsList>
                          <TabsTrigger value="email"><Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Email</TabsTrigger>
                          <TabsTrigger value="inapp"><Bell className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />In-app</TabsTrigger>
                        </TabsList>
                        <TabsContent value="email" className="mt-3">
                          {preview ? (
                            <div className="overflow-hidden rounded-lg border">
                              <div className="border-b bg-muted/40 px-3 py-2 text-xs">
                                <span className="text-muted-foreground">Subject: </span>
                                <span className="font-medium" data-testid="digest-preview-subject">{preview.email.subject}</span>
                              </div>
                              <iframe
                                title="Email preview"
                                sandbox=""
                                srcDoc={preview.email.html}
                                className="h-[640px] w-full bg-white"
                              />
                            </div>
                          ) : (
                            <Skeleton className="h-[640px] w-full" />
                          )}
                        </TabsContent>
                        <TabsContent value="inapp" className="mt-3">
                          {preview ? (
                            <div className="rounded-lg border bg-card p-4" data-testid="digest-preview-inapp">
                              <div className="flex items-start gap-3">
                                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                  <Bell className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium leading-snug">{preview.inApp.title}</p>
                                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{preview.inApp.body}</p>
                                  <p className="mt-2 text-xs text-muted-foreground">Opens {preview.inApp.link}</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <Skeleton className="h-28 w-full" />
                          )}
                        </TabsContent>
                      </Tabs>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Send</CardTitle>
                  <CardDescription>Send yourself a test first. Send now goes to every parent in the audience straight away (once every 10 minutes at most).</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={sendTest} disabled={testing || options.students.length === 0}>
                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" />}
                    Send test to me
                  </Button>
                  <Button onClick={openSendNow} disabled={dirty || sending}>
                    <Send className="mr-2 h-4 w-4" />
                    Send now
                  </Button>
                  {dirty && <p className="w-full text-xs text-muted-foreground">Save your changes before sending to parents.</p>}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── History ── */}
          <Card className="mt-5">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4" aria-hidden="true" /> History
                </CardTitle>
                <CardDescription className="mt-1">Every digest that went out, scheduled or sent by hand.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={loadRuns} aria-label="Refresh history">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {!runs ? (
                <Skeleton className="h-24 w-full" />
              ) : runs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No digests have been sent yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Sent by</TableHead>
                        <TableHead className="text-right">Parents</TableHead>
                        <TableHead className="text-right">Emails sent</TableHead>
                        <TableHead className="text-right">Failed</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap">{formatInZone(r.startedAt, settings.timezone)}</TableCell>
                          <TableCell>{r.trigger === "scheduled" ? <Badge variant="secondary">Scheduled</Badge> : r.triggeredByName ?? "Admin"}</TableCell>
                          <TableCell className="text-right">
                            {r.recipients}
                            {r.skippedOptedOut > 0 && <span className="block text-xs text-muted-foreground">{r.skippedOptedOut} opted out</span>}
                          </TableCell>
                          <TableCell className="text-right">{r.emailsSent}</TableCell>
                          <TableCell className={`text-right ${r.emailsFailed > 0 ? "font-medium text-destructive" : ""}`}>{r.emailsFailed}</TableCell>
                          <TableCell>
                            {r.status === "running" ? (
                              <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Sending</Badge>
                            ) : r.status === "failed" ? (
                              <Badge variant="destructive" title={r.error ?? undefined}>Failed</Badge>
                            ) : (
                              <Badge variant="outline">Done</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <AlertDialog open={confirmOpen} onOpenChange={(o) => !sending && setConfirmOpen(o)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send the digest now?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {audienceLoading ? (
                      <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Counting recipients…</p>
                    ) : audience ? (
                      <>
                        <p data-testid="digest-recipient-count">
                          This sends a digest to <strong className="text-foreground">{audience.parents} parent{audience.parents === 1 ? "" : "s"}</strong>
                          {" "}covering {audience.students} student{audience.students === 1 ? "" : "s"}.
                        </p>
                        {audience.optedOut > 0 && <p>{audience.optedOut} parent{audience.optedOut === 1 ? " has" : "s have"} turned the digest off and won't get it.</p>}
                        <p>{settings.smtpConfigured ? "Each parent gets it in the app and by email (if they allow email)." : "Parents get it in the app (email isn't set up)."}</p>
                      </>
                    ) : (
                      <p>Couldn't count recipients.</p>
                    )}
                    {settings.sendNowRetryAfterMs > 0 && <p className="text-warning">A digest went out in the last 10 minutes. Wait a little before sending again.</p>}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    sendNow();
                  }}
                  disabled={sending || audienceLoading || !audience || audience.parents === 0}
                >
                  {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send to {audience?.parents ?? "…"} parent{audience?.parents === 1 ? "" : "s"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </AdminLayout>
  );
}
