import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CreditCard,
  ExternalLink,
  Loader2,
  Mail,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  api,
  ApiError,
  CURRENCIES,
  formatMoney,
  priceLabel,
  type AdmissionDetails,
  type ExtraLink,
  type NextStep,
  type ProgramPrice,
} from "@/lib/admissions";

interface StripeView {
  platformConfigured: boolean;
  connected: boolean;
  chargesEnabled: boolean;
  status: string;
  ready: boolean;
}

interface ProgramRow {
  id: string;
  name: string;
  isActive: boolean;
  price: ProgramPrice | null;
  override: { applicationFeeCents: number | null; congratsMessage: string | null; nextSteps: NextStep[] | null } | null;
}

interface SettingsResponse {
  fee: { enabled: boolean; amountCents: number; currency: string };
  stripe: StripeView;
  details: AdmissionDetails;
  isDefaultDetails: boolean;
  defaults: AdmissionDetails;
  placeholders: string[];
  programs: ProgramRow[];
  minFeeCents: number;
}

const PLACEHOLDER_HELP: Record<string, string> = {
  "{studentName}": "Applicant's name",
  "{programName}": "Program they applied to",
  "{schoolName}": "Your school's name",
  "{startDate}": "Start / orientation date",
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ─── Application fee ────────────────────────────────────────────────────────
function FeeSettings({ data, onSaved }: { data: SettingsResponse; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(data.fee.enabled);
  const [amount, setAmount] = useState(data.fee.amountCents > 0 ? (data.fee.amountCents / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState(data.fee.currency || "usd");
  const [saving, setSaving] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const stripe = data.stripe;

  const save = async (nextEnabled = enabled) => {
    setSaving(true);
    setStripeError(null);
    try {
      const cents = Math.round(parseFloat(amount || "0") * 100);
      if (nextEnabled && (!Number.isFinite(cents) || cents < data.minFeeCents)) {
        toast.error(`Enter a fee of at least ${formatMoney(data.minFeeCents, currency)}`);
        return;
      }
      await api("/admissions/settings/fee", {
        method: "PUT",
        body: JSON.stringify({ enabled: nextEnabled, amountCents: Number.isFinite(cents) ? cents : 0, currency }),
      });
      setEnabled(nextEnabled);
      toast.success(nextEnabled ? "Application fee is on" : "Applications are free");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === "stripe_not_ready") {
        setStripeError(err.message);
        setEnabled(false);
      } else {
        toast.error((err as Error).message || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" /> Application fee
        </CardTitle>
        <CardDescription>
          Applying is free unless you turn this on. Applicants then pay online, on your school's own Stripe account,
          right after they submit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!stripe.ready && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3" role="status" data-testid="stripe-required">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Connect Stripe to charge an application fee</p>
              <p className="text-muted-foreground mt-0.5">
                {!stripe.platformConfigured
                  ? "Online payments aren't available on this platform yet."
                  : !stripe.connected
                  ? "Your school hasn't connected a Stripe account yet."
                  : "Your Stripe account is connected but can't take card payments yet. Finish Stripe's setup."}
              </p>
              {stripe.platformConfigured && (
                <Link href="/dashboard/admin/tuition" className="inline-flex items-center gap-1 mt-1.5 text-primary font-medium hover:underline">
                  {stripe.connected ? "Finish connecting Stripe" : "Connect Stripe"} <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Charge an application fee</p>
            <p className="text-xs text-muted-foreground">{enabled ? "On: applicants pay to apply" : "Off: applying is free"}</p>
          </div>
          <Switch
            checked={enabled}
            disabled={saving || (!enabled && !stripe.ready)}
            onCheckedChange={(v) => {
              if (!v) save(false);
              else setEnabled(true);
            }}
            aria-label="Charge an application fee"
          />
        </div>

        {enabled && (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_110px] gap-2 max-w-sm">
              <div className="space-y-1.5">
                <Label htmlFor="fee-amount">Fee amount</Label>
                <Input id="fee-amount" type="number" inputMode="decimal" min="0.5" step="0.01" placeholder="50.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fee-currency">Currency</Label>
                <select id="fee-currency" className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button onClick={() => save(true)} disabled={saving} size="sm">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save fee
            </Button>
          </div>
        )}

        {stripeError && (
          <p className="text-sm text-destructive" role="alert">{stripeError}</p>
        )}

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          <p>Programs can have their own fee (or be free) under the Programs tab.</p>
          <p>Unpaid applications stay visible in Admissions, marked "Awaiting payment". You can waive the fee for an individual applicant.</p>
          <p><strong>Refunds</strong> aren't handled here: issue them from your Stripe dashboard.</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Editors ────────────────────────────────────────────────────────────────
function StepsEditor({ steps, onChange, idPrefix }: { steps: NextStep[]; onChange: (s: NextStep[]) => void; idPrefix: string }) {
  const update = (i: number, patch: Partial<NextStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const next = [...steps];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2" data-testid="next-step">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
            <Input aria-label={`Step ${i + 1} title`} id={`${idPrefix}-title-${i}`} placeholder="Step title" maxLength={120} value={s.title} onChange={(e) => update(i, { title: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move step up">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move step down">
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => onChange(steps.filter((_, j) => j !== i))} aria-label="Remove step">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea aria-label={`Step ${i + 1} description`} rows={2} maxLength={600} placeholder="What should they do?" value={s.description} onChange={(e) => update(i, { description: e.target.value })} />
          <Input aria-label={`Step ${i + 1} link`} type="url" placeholder="Optional link, https://…" maxLength={500} value={s.url ?? ""} onChange={(e) => update(i, { url: e.target.value || null })} />
        </div>
      ))}
      {steps.length < 10 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...steps, { title: "", description: "", url: null }])}>
          <Plus className="h-4 w-4 mr-1" /> Add step
        </Button>
      )}
    </div>
  );
}

function ListEditor({ items, onChange, placeholder, label }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; label: string }) {
  return (
    <div className="space-y-2">
      {items.map((d, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label={`${label} ${i + 1}`} maxLength={200} value={d} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-destructive" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${label.toLowerCase()}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {items.length < 20 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
          <Plus className="h-4 w-4 mr-1" /> Add {label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

function LinksEditor({ links, onChange }: { links: ExtraLink[]; onChange: (v: ExtraLink[]) => void }) {
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
          <Input aria-label={`Link ${i + 1} label`} maxLength={100} placeholder="Student handbook" value={l.label} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Input aria-label={`Link ${i + 1} address`} type="url" maxLength={500} placeholder="https://…" value={l.url} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-destructive" onClick={() => onChange(links.filter((_, j) => j !== i))} aria-label="Remove link">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {links.length < 10 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...links, { label: "", url: "" }])}>
          <Plus className="h-4 w-4 mr-1" /> Add link
        </Button>
      )}
    </div>
  );
}

/** Server-rendered preview of the exact email, in a sandboxed iframe (no scripts). */
function EmailPreview({ body }: { body: Record<string, unknown> }) {
  const debounced = useDebounced(JSON.stringify(body), 400);
  const [html, setHtml] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    api<{ subject: string; html: string }>("/admissions/settings/preview", { method: "POST", body: debounced })
      .then((r) => {
        if (n !== seq.current) return;
        setHtml(r.html);
        setSubject(r.subject);
      })
      .catch(() => {})
      .finally(() => n === seq.current && setLoading(false));
  }, [debounced]);

  return (
    <div className="rounded-xl border bg-muted/30 overflow-hidden" data-testid="email-preview">
      <div className="px-3 py-2 border-b bg-card text-xs flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate"><span className="text-muted-foreground">Subject:</span> {subject || "…"}</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
      </div>
      <iframe title="Email preview" sandbox="" srcDoc={html} className="w-full h-[640px] bg-white" />
    </div>
  );
}

// ─── Admission details (school-wide) ────────────────────────────────────────
function DetailsSettings({ data, onSaved }: { data: SettingsResponse; onSaved: () => void }) {
  const [d, setD] = useState<AdmissionDetails>(data.details);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewProgram, setPreviewProgram] = useState<string>("");
  const set = <K extends keyof AdmissionDetails>(k: K, v: AdmissionDetails[K]) => setD((x) => ({ ...x, [k]: v }));
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const insertPlaceholder = (ph: string) => {
    const el = messageRef.current;
    if (!el) return set("message", `${d.message}${ph}`);
    const start = el.selectionStart ?? d.message.length;
    const end = el.selectionEnd ?? start;
    set("message", d.message.slice(0, start) + ph + d.message.slice(end));
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ details: AdmissionDetails }>("/admissions/settings/details", { method: "PUT", body: JSON.stringify(d) });
      setD(r.details);
      toast.success("Admission details saved");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await api<{ to: string }>("/admissions/settings/test-email", {
        method: "POST",
        body: JSON.stringify({ details: d, programId: previewProgram || null }),
      });
      toast.success(`Test email sent to ${r.to}`);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't send the test email");
    } finally {
      setTesting(false);
    }
  };

  const previewBody = useMemo(() => ({ details: d, programId: previewProgram || null }), [d, previewProgram]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Congratulations message</CardTitle>
            <CardDescription>
              Sent to the applicant, with your school's name and logo, the moment you approve them.
              {data.isDefaultDetails && " You're using the default text. Edit it to make it yours."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="adm-headline">Headline</Label>
              <Input id="adm-headline" maxLength={150} value={d.headline} onChange={(e) => set("headline", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-message">Message</Label>
              <Textarea id="adm-message" ref={messageRef} rows={6} maxLength={3000} value={d.message} onChange={(e) => set("message", e.target.value)} />
              <div className="flex flex-wrap gap-1.5" aria-label="Insert a placeholder">
                {data.placeholders.map((ph) => (
                  <button key={ph} type="button" onClick={() => insertPlaceholder(ph)} title={PLACEHOLDER_HELP[ph]} className="rounded-full border bg-muted/50 px-2 py-0.5 text-xs font-mono hover:bg-muted">
                    {ph}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Placeholders are filled in for each student. Plain text only; a blank line starts a new paragraph.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-start">Program start / orientation date</Label>
              <Input id="adm-start" type="date" className="max-w-[200px]" value={d.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next steps</CardTitle>
            <CardDescription>Numbered, in this order. Links must start with http:// or https://.</CardDescription>
          </CardHeader>
          <CardContent>
            <StepsEditor steps={d.nextSteps} onChange={(v) => set("nextSteps", v)} idPrefix="adm-step" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Required documents</CardTitle>
          </CardHeader>
          <CardContent>
            <ListEditor items={d.requiredDocuments} onChange={(v) => set("requiredDocuments", v)} placeholder="e.g. Copy of passport" label="Document" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact person</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="adm-cname">Name</Label>
              <Input id="adm-cname" maxLength={120} value={d.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-cemail">Email</Label>
              <Input id="adm-cemail" type="email" maxLength={200} value={d.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adm-cphone">Phone</Label>
              <Input id="adm-cphone" type="tel" maxLength={50} value={d.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Extra links</CardTitle>
            <CardDescription>For example your handbook or a campus map.</CardDescription>
          </CardHeader>
          <CardContent>
            <LinksEditor links={d.extraLinks} onChange={(v) => set("extraLinks", v)} />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 sticky bottom-0 bg-background/95 py-3 border-t">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save admission details
          </Button>
          <Button variant="outline" onClick={sendTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send test to me
          </Button>
          <Button variant="ghost" onClick={() => setD(data.defaults)}>Reset to default text</Button>
        </div>
      </div>

      <div className="space-y-2 min-w-0 xl:sticky xl:top-4 self-start">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Live preview</p>
          {data.programs.length > 0 && (
            <select aria-label="Preview as program" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={previewProgram} onChange={(e) => setPreviewProgram(e.target.value)}>
              <option value="">Sample program</option>
              {data.programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <EmailPreview body={previewBody} />
      </div>
    </div>
  );
}

// ─── Per-program overrides ──────────────────────────────────────────────────
function ProgramOverrides({ data, onSaved }: { data: SettingsResponse; onSaved: () => void }) {
  const [programId, setProgramId] = useState<string>(data.programs[0]?.id ?? "");
  const program = data.programs.find((p) => p.id === programId);
  const [feeMode, setFeeMode] = useState<"default" | "free" | "custom">("default");
  const [fee, setFee] = useState("");
  const [message, setMessage] = useState("");
  const [useOwnSteps, setUseOwnSteps] = useState(false);
  const [steps, setSteps] = useState<NextStep[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const o = program?.override;
    const f = o?.applicationFeeCents;
    setFeeMode(f === null || f === undefined ? "default" : f === 0 ? "free" : "custom");
    setFee(f ? (f / 100).toFixed(2) : "");
    setMessage(o?.congratsMessage ?? "");
    setUseOwnSteps(!!o?.nextSteps?.length);
    setSteps(o?.nextSteps?.length ? o.nextSteps : data.details.nextSteps);
  }, [programId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data.programs.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You have no programs yet. <Link href="/dashboard/admin/programs" className="text-primary hover:underline">Create one</Link> to set its price and admission details.
        </CardContent>
      </Card>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const cents = feeMode === "default" ? null : feeMode === "free" ? 0 : Math.round(parseFloat(fee || "0") * 100);
      await api(`/admissions/programs/${programId}`, {
        method: "PUT",
        body: JSON.stringify({ applicationFeeCents: cents, congratsMessage: message.trim() || null, nextSteps: useOwnSteps ? steps : null }),
      });
      toast.success(`${program?.name} saved`);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const schoolFee = data.fee.enabled ? formatMoney(data.fee.amountCents, data.fee.currency) : "free";

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Program overrides</CardTitle>
          <CardDescription>Optional. Anything left blank uses your school-wide settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="ovr-program">Program</Label>
            <select id="ovr-program" className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={programId} onChange={(e) => setProgramId(e.target.value)}>
              {data.programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {priceLabel(p.price)}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Price: {priceLabel(program?.price)}. <Link href="/dashboard/admin/programs" className="text-primary hover:underline">Change it in Programs</Link>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Application fee for this program</Label>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Application fee for this program">
              {(
                [
                  ["default", `School default (${schoolFee})`],
                  ["free", "Free"],
                  ["custom", "Its own amount"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={feeMode === v} onClick={() => setFeeMode(v)} className={`rounded-lg border p-2.5 text-left text-sm ${feeMode === v ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40"}`}>
                  {label}
                </button>
              ))}
            </div>
            {feeMode === "custom" && (
              <div className="flex items-center gap-2 max-w-xs">
                <Input aria-label="Program application fee" type="number" min="0.5" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="25.00" />
                <span className="text-sm text-muted-foreground">{data.fee.currency.toUpperCase()}</span>
              </div>
            )}
            {!data.fee.enabled && feeMode !== "default" && (
              <p className="text-xs text-muted-foreground">The school-wide fee is off, so applications stay free until you turn it on.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ovr-message">Congratulations message for this program</Label>
            <Textarea id="ovr-message" rows={4} maxLength={3000} value={message} placeholder="Leave blank to use the school message" onChange={(e) => setMessage(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Own next steps</p>
                <p className="text-xs text-muted-foreground">Off: uses the school's next steps</p>
              </div>
              <Switch checked={useOwnSteps} onCheckedChange={setUseOwnSteps} aria-label="Own next steps" />
            </div>
            {useOwnSteps && <StepsEditor steps={steps} onChange={setSteps} idPrefix="ovr-step" />}
          </div>

          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save program settings
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2 min-w-0">
        <p className="text-sm font-semibold">Preview for {program?.name}</p>
        <EmailPreview body={{ programId, programOverride: { congratsMessage: message.trim() || null, nextSteps: useOwnSteps ? steps : null } }} />
      </div>
    </div>
  );
}

export default function AdminAdmissionSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery<SettingsResponse>({
    queryKey: ["admission-settings"],
    queryFn: () => api<SettingsResponse>("/admissions/settings"),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admission-settings"] });

  return (
    <AdminLayout>
      <div className="px-6 pt-4 pb-0">
        <Link href="/dashboard/admin/admissions">
          <button className="flex items-center gap-1.5 min-h-10 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Admissions
          </button>
        </Link>
      </div>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Admission settings</h1>
          <p className="text-muted-foreground mt-0.5">Application fee, and the email students get when you approve them.</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : isError || !data ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">{(error as Error)?.message || "Couldn't load admission settings."}</CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="details">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="details">Admission details</TabsTrigger>
              <TabsTrigger value="fee">Application fee</TabsTrigger>
              <TabsTrigger value="programs">Programs</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-4">
              <DetailsSettings data={data} onSaved={refresh} />
            </TabsContent>
            <TabsContent value="fee" className="mt-4 max-w-2xl">
              <FeeSettings data={data} onSaved={refresh} />
            </TabsContent>
            <TabsContent value="programs" className="mt-4">
              <ProgramOverrides data={data} onSaved={refresh} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}
