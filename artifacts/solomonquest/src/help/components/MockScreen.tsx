/**
 * Renders a stylised, data-driven mini mock of a SolomonQuest screen
 * (see MockEl in ../types). Purely presentational: no real data, no
 * network. Every element with an `id` gets `data-mid`, which the player
 * uses to move the cursor and draw the pulse ring.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  Award, Bell, Calendar, Camera, Check, ChevronDown, Dices, DollarSign, Download, Eye, FileText, Link2,
  Lock, Mail, Menu, MessageSquare, Pencil, Play, Plus, Search, Send, Settings, Star, Upload, User, Video, X,
  Filter, Paperclip, Printer, Trash2, Globe, Shield, ToggleRight, BookOpen, Users, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MockEl, MockScreen, MockState, MockTone } from "../types";
import { CHROME_LABEL, NAV } from "../mock";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  award: Award, bell: Bell, calendar: Calendar, camera: Camera, check: Check, dice: Dices, dollar: DollarSign,
  download: Download, eye: Eye, file: FileText, link: Link2, lock: Lock, mail: Mail, message: MessageSquare,
  edit: Pencil, play: Play, plus: Plus, search: Search, send: Send, settings: Settings, star: Star,
  upload: Upload, user: User, video: Video, x: X, filter: Filter, clip: Paperclip, print: Printer,
  trash: Trash2, globe: Globe, shield: Shield, toggle: ToggleRight, book: BookOpen, users: Users, card: CreditCard,
};

function Ico({ name, className }: { name?: string; className?: string }) {
  if (!name) return null;
  const C = ICONS[name];
  return C ? <C className={cn("h-3 w-3 shrink-0", className)} /> : null;
}

const TONE_BADGE: Record<MockTone, string> = {
  default: "bg-secondary text-secondary-foreground border-border",
  muted: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary/10 text-primary border-primary/20",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  gold: "bg-gold/15 text-foreground border-gold/40",
};

/** Types `value` out character by character when `animate` is on. */
function useTyped(value: string | undefined, animate: boolean): string {
  const v = value ?? "";
  const [n, setN] = useState(animate ? 0 : v.length);
  useEffect(() => {
    if (!animate) { setN(v.length); return; }
    setN(0);
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= v.length) window.clearInterval(t);
    }, 45);
    return () => window.clearInterval(t);
  }, [v, animate]);
  return v.slice(0, n);
}

interface Ctx {
  state: MockState;
  typing: Set<string>;
  reduced: boolean;
}

function merge<T extends MockEl>(el: T, state: MockState): T {
  return el.id && state[el.id] ? ({ ...el, ...state[el.id] } as T) : el;
}

function Field({ el, ctx }: { el: Extract<MockEl, { k: "field" }>; ctx: Ctx }) {
  const typed = useTyped(el.value, !!el.id && ctx.typing.has(el.id) && !ctx.reduced);
  const shown = el.type === "password" && typed ? "•".repeat(typed.length) : typed;
  const typingNow = !!el.id && ctx.typing.has(el.id) && !ctx.reduced && typed.length < (el.value ?? "").length;
  return (
    <label className="block min-w-0 flex-1 basis-24" data-mid={el.id}>
      <span className="block text-[10.5px] font-medium text-foreground/80 mb-1">{el.label}</span>
      <span
        className={cn(
          "flex w-full rounded-md border border-input bg-card px-2 text-[11px] text-foreground",
          el.multiline ? "min-h-[46px] py-1.5 items-start" : "h-7 items-center",
        )}
      >
        {shown ? <span className="truncate">{shown}</span> : <span className="truncate text-muted-foreground">{el.placeholder ?? ""}</span>}
        {typingNow && <span className="help-caret ml-px inline-block h-3 w-px bg-foreground" />}
      </span>
    </label>
  );
}

function El({ raw, ctx }: { raw: MockEl; ctx: Ctx }): ReactNode {
  const el = merge(raw, ctx.state);
  if ((el as { hidden?: boolean }).hidden) return null;
  switch (el.k) {
    case "button": {
      const v = el.variant ?? "primary";
      return (
        <span
          data-mid={el.id}
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-md font-medium whitespace-nowrap select-none",
            el.small ? "h-6 px-2 text-[10px]" : "h-7 px-2.5 text-[11px]",
            v === "primary" && "bg-primary text-primary-foreground",
            v === "gold" && "bg-gold text-gold-foreground",
            v === "outline" && "border border-border bg-card text-foreground",
            v === "ghost" && "text-foreground/80",
            v === "danger" && "bg-destructive text-destructive-foreground",
          )}
        >
          <Ico name={el.icon} />
          {el.label}
        </span>
      );
    }
    case "tabs":
      return (
        <div data-mid={el.id} className="flex flex-wrap gap-0.5 rounded-md bg-muted p-0.5 w-fit max-w-full">
          {el.items.map((t, i) => (
            <span
              key={t}
              data-mid={el.id ? `${el.id}:${i}` : undefined}
              className={cn(
                "rounded px-2 py-1 text-[10.5px] font-medium whitespace-nowrap",
                i === (el.active ?? 0) ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {t}
            </span>
          ))}
        </div>
      );
    case "field":
      return <Field el={el} ctx={ctx} />;
    case "select":
      return (
        <div className="min-w-0 flex-1 basis-24" data-mid={el.id}>
          <span className="block text-[10.5px] font-medium text-foreground/80 mb-1">{el.label}</span>
          <span className="flex h-7 items-center justify-between rounded-md border border-input bg-card px-2 text-[11px]">
            <span className={cn("truncate", !el.value && "text-muted-foreground")}>{el.value ?? el.placeholder}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </span>
        </div>
      );
    case "toggle":
      return (
        <div data-mid={el.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-2.5 py-1.5">
          <span className="min-w-0">
            <span className="block text-[11px] font-medium">{el.label}</span>
            {el.hint && <span className="block text-[9.5px] text-muted-foreground">{el.hint}</span>}
          </span>
          <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors duration-300", el.on ? "bg-primary" : "bg-muted-foreground/30")}>
            <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-card shadow transition-all duration-300", el.on ? "left-3.5" : "left-0.5")} />
          </span>
        </div>
      );
    case "check":
      return (
        <span data-mid={el.id} className="flex items-center gap-1.5 text-[11px]">
          <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded border", el.on ? "bg-primary border-primary text-primary-foreground" : "border-input bg-card")}>
            {el.on && <Check className="h-2.5 w-2.5" />}
          </span>
          {el.label}
        </span>
      );
    case "upload":
      return (
        <div data-mid={el.id} className={cn("flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-3 text-center", el.file ? "border-success/40 bg-success/5" : "border-border")}>
          {el.file ? <FileText className="h-4 w-4 text-success" /> : <Upload className="h-4 w-4 text-primary" />}
          <span className="text-[11px] font-medium">{el.file ?? el.label}</span>
          {!el.file && el.hint && <span className="text-[9.5px] text-muted-foreground">{el.hint}</span>}
        </div>
      );
    case "table":
      return (
        <div data-mid={el.id} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid border-b bg-muted/60" style={{ gridTemplateColumns: `repeat(${el.cols.length}, minmax(0,1fr))` }}>
            {el.cols.map((c) => <span key={c} className="truncate px-2 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{c}</span>)}
          </div>
          {el.rows.map((r, ri) => (
            <div
              key={ri}
              data-mid={el.rowIds?.[ri]}
              className={cn("grid border-b last:border-0", el.highlightRow === ri && "bg-gold/10")}
              style={{ gridTemplateColumns: `repeat(${el.cols.length}, minmax(0,1fr))` }}
            >
              {r.map((c, ci) => (
                <span key={ci} data-mid={el.id ? `${el.id}:${ri}:${ci}` : undefined} className={cn("truncate px-2 py-1.5 text-[10.5px]", ci === 0 && "font-medium")}>{c}</span>
              ))}
            </div>
          ))}
        </div>
      );
    case "card":
      return (
        <div data-mid={el.id} className={cn("rounded-lg border bg-card p-2.5 space-y-2 min-w-0", el.tone === "gold" ? "border-gold/50" : el.tone === "warning" ? "border-warning/40 bg-warning/5" : "border-border")}>
          {(el.title || el.badge) && (
            <div className="flex items-center justify-between gap-2">
              {el.title && <p className="font-serif text-[13px] font-semibold leading-tight truncate">{el.title}</p>}
              {el.badge && <span className={cn("rounded-full border px-1.5 py-px text-[9px] font-medium", TONE_BADGE[el.tone ?? "default"])}>{el.badge}</span>}
            </div>
          )}
          {el.text && <p className="text-[10.5px] text-muted-foreground leading-snug">{el.text}</p>}
          {el.children?.map((c, i) => <El key={i} raw={c} ctx={ctx} />)}
        </div>
      );
    case "row":
      return (
        <div
          data-mid={el.id}
          className={cn(
            "flex items-center gap-1.5 min-w-0",
            el.wrap && "flex-wrap",
            el.justify === "between" && "justify-between",
            el.justify === "end" && "justify-end",
          )}
        >
          {el.children.map((c, i) => <El key={i} raw={c} ctx={ctx} />)}
        </div>
      );
    case "cols":
      return (
        <div data-mid={el.id} className="grid grid-cols-2 gap-2">
          {el.children.map((c, i) => <El key={i} raw={c} ctx={ctx} />)}
        </div>
      );
    case "stats":
      return (
        <div data-mid={el.id} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(el.items.length, 3)}, minmax(0,1fr))` }}>
          {el.items.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card px-2 py-1.5">
              <p className="text-[9.5px] text-muted-foreground truncate">{s.label}</p>
              <p className={cn("font-serif text-[15px] font-semibold leading-tight", s.tone === "success" && "text-success", s.tone === "warning" && "text-warning", s.tone === "danger" && "text-destructive")}>{s.value}</p>
            </div>
          ))}
        </div>
      );
    case "badge":
      return <span data-mid={el.id} className={cn("inline-flex rounded-full border px-1.5 py-px text-[9.5px] font-medium whitespace-nowrap", TONE_BADGE[el.tone ?? "default"])}>{el.label}</span>;
    case "list":
      return (
        <div data-mid={el.id} className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {el.items.map((it, i) => (
            <div key={i} data-mid={it.id} className="flex items-center gap-2 px-2.5 py-1.5">
              {it.icon && <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary"><Ico name={it.icon} /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium">{it.title}</span>
                {it.meta && <span className="block truncate text-[9.5px] text-muted-foreground">{it.meta}</span>}
              </span>
              {it.badge && <span className={cn("rounded-full border px-1.5 py-px text-[9px] font-medium whitespace-nowrap", TONE_BADGE[it.tone ?? "default"])}>{it.badge}</span>}
            </div>
          ))}
        </div>
      );
    case "text":
      return <p data-mid={el.id} className={cn("leading-snug", el.small ? "text-[10.5px]" : "text-[11.5px]", el.muted && "text-muted-foreground", el.bold && "font-semibold")}>{el.text}</p>;
    case "heading":
      return <p data-mid={el.id} className="font-serif text-[14px] font-semibold">{el.text}</p>;
    case "progress":
      return (
        <div data-mid={el.id}>
          <div className="flex justify-between text-[10px] mb-1"><span>{el.label}</span><span className="tabular-nums text-muted-foreground">{el.value}%</span></div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-gold transition-all duration-700" style={{ width: `${el.value}%` }} /></div>
        </div>
      );
    case "chat":
      return (
        <div data-mid={el.id} className="space-y-1.5 rounded-lg border border-border bg-card p-2">
          {el.messages.map((m, i) => (
            <div key={i} className={cn("flex", m.me && "justify-end")}>
              <div className={cn("max-w-[78%] rounded-xl px-2 py-1 text-[10.5px] leading-snug help-pop", m.me ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm")}>
                {!m.me && <span className="block text-[9px] font-semibold text-muted-foreground">{m.from}</span>}
                {m.text}
              </div>
            </div>
          ))}
        </div>
      );
    case "calendar": {
      const days = Array.from({ length: 28 }, (_, i) => i + 1);
      return (
        <div data-mid={el.id} className="rounded-lg border border-border bg-card p-2">
          <p className="mb-1 font-serif text-[12px] font-semibold">{el.month}</p>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const ev = el.events.find((e) => e.day === d);
              return (
                <div key={d} data-mid={ev && el.id ? `${el.id}:${d}` : undefined} className="min-h-[26px] rounded border border-border/60 p-0.5">
                  <span className="block text-[8.5px] text-muted-foreground">{d}</span>
                  {ev && <span className={cn("block truncate rounded px-0.5 text-[7.5px] font-medium border", TONE_BADGE[ev.tone ?? "primary"])}>{ev.label}</span>}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    case "chart":
      return (
        <div data-mid={el.id} className="flex h-20 items-end gap-1 rounded-lg border border-border bg-card p-2">
          {el.bars.map((b, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
              <div className="w-full rounded-t bg-primary/80 help-grow" style={{ height: `${b}%`, animationDelay: `${i * 60}ms` }} />
              {el.labels?.[i] && <span className="text-[7.5px] text-muted-foreground">{el.labels[i]}</span>}
            </div>
          ))}
        </div>
      );
    case "video":
      return (
        <div data-mid={el.id} className="relative aspect-video overflow-hidden rounded-lg bg-brand">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-gold-foreground"><Play className="h-4 w-4" /></span>
          </div>
          <p className="absolute left-2 top-1.5 text-[10px] text-white/80">{el.label}</p>
          <div className="absolute bottom-1.5 left-2 right-2 h-1 rounded-full bg-white/20">
            <div className="h-full rounded-full bg-gold transition-all duration-1000" style={{ width: `${el.progress ?? 0}%` }} />
          </div>
        </div>
      );
    case "certificate":
      return (
        <div data-mid={el.id} className="rounded-lg border-2 border-gold/60 bg-card p-3 text-center">
          <Award className="mx-auto h-5 w-5 text-gold" />
          <p className="font-serif text-[14px] font-semibold">Certificate of Completion</p>
          <p className="text-[9.5px] text-muted-foreground">This certifies that</p>
          <p className="font-serif text-[15px] italic">{el.name}</p>
          <p className="text-[9.5px] text-muted-foreground">completed {el.course}{el.school ? ` · ${el.school}` : ""}</p>
        </div>
      );
    case "avatar":
      return (
        <span data-mid={el.id} className="inline-flex items-center gap-2">
          <span className={cn("relative flex h-10 w-10 items-center justify-center rounded-full font-serif text-[14px] font-semibold", el.photo ? "bg-gradient-to-br from-gold/70 to-primary/70 text-white" : "bg-primary text-primary-foreground")}>
            {el.initials}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card border border-border"><Camera className="h-2.5 w-2.5" /></span>
          </span>
          {el.label && <span className="text-[11px] font-medium">{el.label}</span>}
        </span>
      );
    // Overlays are drawn by MockScreen itself (see below)
    case "dialog":
    case "menu":
    case "toast":
      return null;
  }
}

function collectOverlays(els: MockEl[], out: MockEl[] = []): MockEl[] {
  for (const e of els) {
    if (e.k === "dialog" || e.k === "menu" || e.k === "toast") out.push(e);
    if (e.k === "card" && e.children) collectOverlays(e.children, out);
    if ((e.k === "row" || e.k === "cols") && e.children) collectOverlays(e.children, out);
  }
  return out;
}

export interface MockScreenProps {
  screen: MockScreen;
  state: MockState;
  narrow: boolean;
  typing: Set<string>;
  reduced: boolean;
  /** Narrow layout: show the slide-in navigation drawer (when a step points at a nav item). */
  drawerOpen: boolean;
}

export function MockScreenView({ screen, state, narrow, typing, reduced, drawerOpen }: MockScreenProps) {
  const ctx: Ctx = { state, typing, reduced };
  const nav = NAV[screen.chrome];
  const hasSidebar = nav.length > 0;
  const overlays = collectOverlays([...(screen.actions ?? []), ...screen.body]).map((o) => merge(o, state));
  const isPublic = screen.chrome === "public";

  const navList = (
    <nav className="flex flex-col gap-px px-1.5">
      {nav.map((label) => (
        <span
          key={label}
          data-mid={`nav:${label}`}
          className={cn(
            // phone drawer uses tighter rows so the long admin menu fits the stage
            "relative flex items-center rounded px-2 truncate",
            narrow ? "h-[17px] text-[9.5px]" : "h-[19px] text-[10px]",
            label === screen.active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/75",
          )}
        >
          {label === screen.active && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded bg-gold" />}
          {label}
        </span>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-1.5 px-3 py-2.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand font-serif text-[11px] font-semibold text-gold ring-1 ring-gold/40">S</span>
      <span className="leading-none">
        <span className="block text-[11px] font-semibold text-sidebar-foreground">SolomonQuest</span>
        <span className="block text-[7px] uppercase tracking-[0.18em] text-sidebar-foreground/60">{CHROME_LABEL[screen.chrome]}</span>
      </span>
    </div>
  );

  const topBar = (
    <div className="flex h-9 items-center gap-2 border-b border-border bg-card px-2.5">
      {narrow && hasSidebar && (
        <span data-mid="menu-btn" className="flex h-6 w-6 items-center justify-center rounded text-foreground"><Menu className="h-3.5 w-3.5" /></span>
      )}
      {(narrow || !hasSidebar) && (
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand font-serif text-[11px] font-semibold text-gold">S</span>
          <span className="text-[11px] font-semibold">SolomonQuest</span>
        </span>
      )}
      {!narrow && hasSidebar && (
        <span className="flex h-6 flex-1 max-w-[200px] items-center gap-1 rounded-md bg-muted px-2 text-[10px] text-muted-foreground"><Search className="h-3 w-3" />Search…</span>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        {isPublic ? (
          <>
            {!narrow && <span data-mid="pub:explore" className="text-[10.5px] font-medium">Explore Schools</span>}
            <span data-mid="pub:signin" className="rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">Sign In</span>
          </>
        ) : (
          <>
            <span data-mid="bell" className="relative flex h-6 w-6 items-center justify-center rounded text-foreground/80">
              <Bell className="h-3.5 w-3.5" />
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-gold" />
            </span>
            <span data-mid="avatar" className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">AO</span>
          </>
        )}
      </span>
    </div>
  );

  return (
    <div className="relative flex w-full overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm" style={{ minHeight: narrow ? 400 : 430 }}>
      {hasSidebar && !narrow && (
        <aside className="w-[150px] shrink-0 bg-sidebar pb-2">
          {brand}
          {navList}
        </aside>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {topBar}
        <div className="min-w-0 flex-1 space-y-2.5 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-serif text-[17px] font-semibold leading-tight">{screen.title}</p>
              {screen.subtitle && <p className="text-[10.5px] text-muted-foreground">{screen.subtitle}</p>}
            </div>
            {screen.actions && screen.actions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">{screen.actions.map((a, i) => <El key={i} raw={a} ctx={ctx} />)}</div>
            )}
          </div>
          {screen.body.map((b, i) => <El key={i} raw={b} ctx={ctx} />)}
        </div>

        {/* Menus anchor under the top bar on the right */}
        {overlays.filter((o): o is Extract<MockEl, { k: "menu" }> => o.k === "menu" && !!o.open).map((m) => (
          <div key={m.id} data-mid={m.id} className={cn("absolute top-9 z-20 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg help-pop", m.align === "left" ? "left-2" : "right-2")}>
            {m.items.map((it) => (
              <span key={it.label} data-mid={it.id} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10.5px]">
                <Ico name={it.icon} className="text-muted-foreground" />
                {it.label}
              </span>
            ))}
          </div>
        ))}

        {overlays.filter((o): o is Extract<MockEl, { k: "toast" }> => o.k === "toast" && !!o.open).map((t) => (
          <div key={t.id} data-mid={t.id} className={cn("absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[10.5px] font-medium shadow-lg help-pop", t.tone === "danger" ? "border-destructive/40" : "border-success/40")}>
            <Check className={cn("h-3 w-3", t.tone === "danger" ? "text-destructive" : "text-success")} />
            {t.text}
          </div>
        ))}
      </div>

      {/* Phone-width navigation drawer */}
      {narrow && hasSidebar && drawerOpen && (
        <div className="absolute inset-0 z-30 flex">
          <aside className="w-[62%] max-w-[220px] bg-sidebar pb-2 shadow-xl help-slide-in">
            {brand}
            {navList}
          </aside>
          <div className="flex-1 bg-black/30" />
        </div>
      )}

      {overlays.filter((o): o is Extract<MockEl, { k: "dialog" }> => o.k === "dialog" && !!o.open).map((d) => (
        <div key={d.id} className="absolute inset-0 z-40 flex items-start justify-center bg-black/35 px-3 pt-6">
          <div data-mid={d.id} className="w-full max-w-[340px] space-y-2 rounded-xl border border-border bg-card p-3 shadow-2xl help-pop">
            <div className="flex items-center justify-between">
              <p className="font-serif text-[14px] font-semibold">{d.title}</p>
              <X className="h-3 w-3 text-muted-foreground" />
            </div>
            {d.children.map((c, i) => <El key={i} raw={c} ctx={ctx} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
