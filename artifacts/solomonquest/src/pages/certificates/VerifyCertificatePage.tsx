import { useEffect, useState } from "react";
import { SafeImage } from "@/components/common/SafeImage";
import { Link, useLocation, useParams } from "wouter";
import { BadgeCheck, Loader2, Search, ShieldAlert, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCertDate } from "@/components/certificates/CertificateView";
import type { VerifyResult } from "@/components/certificates/certApi";

/**
 * Public certificate verification: /verify/<code> (no login). Reads through
 * GET /api/certificates/verify/:code, which returns only what a verifier
 * needs to see.
 */
export default function VerifyCertificatePage() {
  const params = useParams<{ code?: string }>();
  const [, setLocation] = useLocation();
  const code = (params.code ?? "").trim();
  const [input, setInput] = useState(code);
  const [state, setState] = useState<{ loading: boolean; result: VerifyResult | null; notFound: boolean; error: string | null }>({
    loading: !!code, result: null, notFound: false, error: null,
  });

  useEffect(() => {
    setInput(code);
    if (!code) { setState({ loading: false, result: null, notFound: false, error: null }); return; }
    let cancelled = false;
    setState({ loading: true, result: null, notFound: false, error: null });
    fetch(`/api/certificates/verify/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) { setState({ loading: false, result: null, notFound: true, error: null }); return; }
        if (!r.ok) throw new Error("Verification is unavailable right now. Try again shortly.");
        setState({ loading: false, result: (await r.json()) as VerifyResult, notFound: false, error: null });
      })
      .catch((e) => !cancelled && setState({ loading: false, result: null, notFound: false, error: (e as Error).message }));
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    document.title = "Verify a certificate · SolomonQuest";
  }, []);

  const r = state.result;
  const accent = r?.accentColor && /^#[0-9a-fA-F]{6}$/.test(r.accentColor) ? r.accentColor : "#c9a054";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,hsl(var(--accent))_0%,hsl(var(--background))_60%)] px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 text-center">
          <Link href="/" className="font-serif text-2xl font-semibold tracking-tight text-foreground">SolomonQuest</Link>
          <p className="mt-1 text-sm text-muted-foreground">Certificate verification</p>
        </div>

        <form
          className="mb-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const c = input.trim().toUpperCase();
            if (c) setLocation(`/verify/${encodeURIComponent(c)}`);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Certificate number, e.g. SQ-AB12-CD34-EF56"
            aria-label="Certificate number"
            className="font-mono uppercase"
          />
          <Button type="submit"><Search className="mr-1.5 h-4 w-4" /> Verify</Button>
        </form>

        {state.loading && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Checking…
          </div>
        )}

        {state.error && (
          <div className="flex items-start gap-3 rounded-2xl border bg-card p-6">
            <ShieldAlert className="mt-0.5 h-6 w-6 text-warning" />
            <p className="text-sm">{state.error}</p>
          </div>
        )}

        {state.notFound && (
          <div className="rounded-2xl border border-destructive/40 bg-card p-6 text-center" data-testid="verify-notfound">
            <ShieldX className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 text-lg font-semibold">No certificate found</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We couldn’t find a certificate with number <span className="font-mono">{code}</span>. Check it was typed exactly as printed.
            </p>
          </div>
        )}

        {r && (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm" data-testid="verify-result">
            <div
              className={`flex items-center gap-3 px-6 py-4 ${r.valid ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
            >
              {r.valid ? <BadgeCheck className="h-7 w-7 shrink-0" /> : <ShieldX className="h-7 w-7 shrink-0" />}
              <div>
                <div className="text-base font-semibold">{r.valid ? "Valid certificate" : "This certificate has been revoked"}</div>
                <div className="text-xs opacity-80">
                  {r.valid ? "Issued by the school named below through SolomonQuest." : r.revokedAt ? `Revoked on ${formatCertDate(r.revokedAt)}` : "It is no longer valid."}
                </div>
              </div>
            </div>
            <div className="px-6 py-6 text-center" style={{ borderTop: `3px solid ${accent}` }}>
              <SafeImage src={r.logoUrl ?? undefined} alt="" height={64} className="mx-auto mb-3 h-16 w-auto max-w-[180px] object-contain" />
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">{r.schoolName}</div>
              <div className="mt-2 font-serif text-2xl font-semibold text-foreground">{r.title}</div>
              <div className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Awarded to</div>
              <div className="font-serif text-3xl italic text-foreground">{r.studentName}</div>
              <dl className="mx-auto mt-6 grid max-w-sm grid-cols-1 gap-3 text-left text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{r.courseName ? "Course" : "Program"}</dt>
                  <dd className="font-medium">{r.courseName || r.programName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Issued</dt>
                  <dd className="font-medium">{formatCertDate(r.issuedAt)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Certificate number</dt>
                  <dd className="font-mono font-medium">{r.verificationCode}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
