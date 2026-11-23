import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// The certificate itself. Drawn at a fixed A4-landscape size (1123 x 794 px,
// i.e. 297 x 210 mm at 96 dpi) and scaled to fit its container on screen, so
// the preview, the student's copy and the printed / saved PDF are identical.
// ---------------------------------------------------------------------------

export const CERT_W = 1123;
export const CERT_H = 794;
const NAVY = "#14203a";
const INK = "#2a3550";
const PAPER = "#fbf8f1";

export interface CertificateSignatory {
  name: string;
  title: string;
  signatureUrl: string | null;
}

export interface CertificateData {
  title: string;
  body: string;
  studentName: string;
  schoolName: string;
  logoUrl: string | null;
  accentColor: string;
  signatories: CertificateSignatory[];
  issuedAt: string;
  verificationCode: string;
  verifyUrl: string;
  status?: "valid" | "revoked";
}

/** Same placeholder fill as the API's renderCertificateBody(). */
export function renderCertificateTemplate(
  template: string,
  values: { studentName: string; courseName: string; programName: string; schoolName: string; date: string },
): string {
  return template.replace(/\{(studentName|courseName|programName|schoolName|date)\}/g, (_m, k: keyof typeof values) => values[k] ?? "");
}

export function formatCertDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function verifyUrlFor(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/verify/${encodeURIComponent(code)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function Corner({ color, className }: { color: string; className: string }) {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" className={cn("absolute", className)} aria-hidden="true">
      <g fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
        <path d="M6 70 V6 H70" strokeWidth="2.4" />
        <path d="M16 56 V16 H56" />
        <path d="M16 16 C 40 22, 52 34, 58 58" />
        <path d="M58 58 c 4 -10 14 -12 20 -6 c -8 2 -12 8 -20 6 z" fill={color} fillOpacity="0.85" />
        <path d="M30 16 c 2 8 8 12 16 12" />
        <path d="M16 30 c 8 2 12 8 12 16" />
      </g>
      <circle cx="6" cy="6" r="4" fill={color} />
      <rect x="66" y="2" width="8" height="8" transform="rotate(45 70 6)" fill={color} />
      <rect x="2" y="66" width="8" height="8" transform="rotate(45 6 70)" fill={color} />
    </svg>
  );
}

function Seal({ color, label }: { color: string; label: string }) {
  const points = Array.from({ length: 48 }, (_, i) => {
    const r = i % 2 === 0 ? 62 : 55;
    const a = (Math.PI * 2 * i) / 48;
    return `${70 + r * Math.cos(a)},${70 + r * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 140 140" width="132" height="132" aria-hidden="true">
      <defs>
        <radialGradient id="cert-seal-sheen" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <path id="cert-seal-arc" d="M 70 70 m -38 0 a 38 38 0 1 1 76 0 a 38 38 0 1 1 -76 0" />
      </defs>
      <polygon points={points} fill={color} />
      <circle cx="70" cy="70" r="50" fill={NAVY} />
      <circle cx="70" cy="70" r="46" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="70" cy="70" r="30" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 3" />
      <text fill={color} fontSize="8" letterSpacing="1.2" fontFamily="Inter, sans-serif" fontWeight="600">
        <textPath href="#cert-seal-arc" startOffset="0">★ OFFICIAL ★ CERTIFICATE ★ VERIFIED</textPath>
      </text>
      <text x="70" y="78" textAnchor="middle" fill={color} fontSize="24" fontFamily="'Cormorant Garamond', Georgia, serif" fontWeight="700">
        {label || "★"}
      </text>
      <polygon points={points} fill="url(#cert-seal-sheen)" />
    </svg>
  );
}

function SignatoryBlock({ s, color }: { s: CertificateSignatory; color: string }) {
  return (
    <div className="flex w-[250px] flex-col items-center text-center">
      <div className="flex h-[64px] w-full items-end justify-center">
        {s.signatureUrl ? (
          <img src={s.signatureUrl} alt="" className="max-h-[60px] max-w-[220px] object-contain" />
        ) : null}
      </div>
      <div className="mt-1 h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="mt-2 text-[19px] font-semibold" style={{ color: NAVY, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
        {s.name || " "}
      </div>
      <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: INK }}>
        {s.title || " "}
      </div>
    </div>
  );
}

/** The certificate at its native 1123 x 794 size. */
export function CertificateCanvas({ data }: { data: CertificateData }) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(data.accentColor) ? data.accentColor : "#c9a054";
  const serif = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  const sigs = data.signatories.slice(0, 2);
  const revoked = data.status === "revoked";

  return (
    <div
      className="cert-canvas relative overflow-hidden select-none"
      style={{
        width: CERT_W,
        height: CERT_H,
        background: `radial-gradient(ellipse at 50% 38%, #ffffff 0%, ${PAPER} 62%, #f3ecdc 100%)`,
        color: NAVY,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* Frame: navy band, gold rule, fine inner gold line */}
      <div className="absolute inset-[18px]" style={{ border: `12px solid ${NAVY}` }} />
      <div className="absolute inset-[34px]" style={{ border: `2px solid ${accent}` }} />
      <div className="absolute inset-[42px]" style={{ border: `1px solid ${accent}`, opacity: 0.7 }} />
      {/* faint guilloche watermark */}
      <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.035]" width="620" height="620" viewBox="0 0 200 200" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <ellipse key={i} cx="100" cy="100" rx="96" ry="38" fill="none" stroke={NAVY} strokeWidth="0.6" transform={`rotate(${i * 10} 100 100)`} />
        ))}
      </svg>
      <Corner color={accent} className="left-[38px] top-[38px]" />
      <Corner color={accent} className="right-[38px] top-[38px] -scale-x-100" />
      <Corner color={accent} className="left-[38px] bottom-[38px] -scale-y-100" />
      <Corner color={accent} className="right-[38px] bottom-[38px] -scale-100" />

      <div className="absolute inset-[64px] flex flex-col items-center text-center">
        {/* Header */}
        <div className="flex h-[88px] items-center justify-center">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="" className="max-h-[84px] max-w-[260px] object-contain" />
          ) : (
            <div
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-[26px] font-bold"
              style={{ background: NAVY, color: accent, fontFamily: serif, boxShadow: `0 0 0 3px ${PAPER}, 0 0 0 4px ${accent}` }}
            >
              {initials(data.schoolName) || "S"}
            </div>
          )}
        </div>
        <div className="mt-2 text-[13px] font-semibold uppercase tracking-[0.34em]" style={{ color: INK }}>
          {data.schoolName}
        </div>

        <h1 className="mt-4 text-[54px] font-semibold leading-none tracking-[0.02em]" style={{ fontFamily: serif, color: NAVY }}>
          {data.title}
        </h1>

        <div className="mt-4 flex items-center gap-3" aria-hidden="true">
          <span className="h-px w-[120px]" style={{ background: `linear-gradient(90deg, transparent, ${accent})` }} />
          <span className="h-[9px] w-[9px] rotate-45" style={{ background: accent }} />
          <span className="h-px w-[120px]" style={{ background: `linear-gradient(270deg, transparent, ${accent})` }} />
        </div>

        <div className="mt-5 text-[13px] uppercase tracking-[0.28em]" style={{ color: INK }}>
          This certificate is proudly presented to
        </div>
        <div className="mt-2 max-w-[880px] truncate px-4 text-[64px] font-medium italic leading-[1.1]" style={{ fontFamily: serif, color: NAVY }}>
          {data.studentName}
        </div>
        <div className="mt-1 h-[2px] w-[520px]" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

        <p className="mt-5 max-w-[760px] text-[21px] leading-[1.45]" style={{ fontFamily: serif, color: INK }}>
          {data.body}
        </p>

        {/* Signatures + seal */}
        <div className="mt-auto flex w-full items-end justify-between px-6">
          {sigs[0] ? (
            <SignatoryBlock s={sigs[0]} color={NAVY} />
          ) : (
            <div className="flex w-[250px] flex-col items-center">
              <div className="text-[19px] font-semibold" style={{ fontFamily: serif }}>{formatCertDate(data.issuedAt)}</div>
              <div className="mt-2 h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${NAVY}, transparent)` }} />
              <div className="mt-2 text-[11px] uppercase tracking-[0.18em]" style={{ color: INK }}>Date of issue</div>
            </div>
          )}
          <div className="-mb-2">
            <Seal color={accent} label={initials(data.schoolName)} />
          </div>
          {sigs[1] ? (
            <SignatoryBlock s={sigs[1]} color={NAVY} />
          ) : sigs[0] ? (
            <div className="flex w-[250px] flex-col items-center">
              <div className="text-[19px] font-semibold" style={{ fontFamily: serif }}>{formatCertDate(data.issuedAt)}</div>
              <div className="mt-2 h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${NAVY}, transparent)` }} />
              <div className="mt-2 text-[11px] uppercase tracking-[0.18em]" style={{ color: INK }}>Date of issue</div>
            </div>
          ) : (
            <div className="w-[250px]" />
          )}
        </div>

        <div className="mt-4 text-[10.5px] uppercase tracking-[0.2em]" style={{ color: INK, opacity: 0.85 }}>
          Issued {formatCertDate(data.issuedAt)} &nbsp;·&nbsp; Certificate No. {data.verificationCode}
        </div>
        <div className="mt-0.5 text-[10.5px] tracking-[0.06em]" style={{ color: INK, opacity: 0.85 }}>
          Verify this certificate at <span style={{ color: NAVY, fontWeight: 600 }}>{data.verifyUrl.replace(/^https?:\/\//, "")}</span>
        </div>
      </div>

      {revoked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="rotate-[-18deg] rounded-md border-[6px] px-10 py-2 text-[96px] font-bold tracking-[0.2em]"
            style={{ color: "rgba(176,32,32,0.55)", borderColor: "rgba(176,32,32,0.55)", fontFamily: serif }}
          >
            REVOKED
          </div>
        </div>
      )}
    </div>
  );
}

/** Responsive wrapper: scales the canvas to the container's width. */
export function CertificateView({ data, className }: { data: CertificateData; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / CERT_W || 0.5);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("relative w-full overflow-hidden rounded-md shadow-[0_10px_40px_-12px_rgba(20,32,58,0.45)] ring-1 ring-black/5", className)}
      style={{ height: CERT_H * scale }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: CERT_W, height: CERT_H }}>
        <CertificateCanvas data={data} />
      </div>
    </div>
  );
}
