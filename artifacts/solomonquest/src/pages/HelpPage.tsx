/**
 * Help Center: role-aware guides at /help and /help/<slug>.
 *
 * - Everyone sees guides written for their role (signed-out visitors get
 *   getting-started guides: find a school, apply, accept an invite).
 * - Admins and super admins can switch to any role's guides, or all of them.
 * - Guides are typed data in src/help/guides; animated ones play a mini mock
 *   of the real screen and can always be shown as plain text steps.
 */
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import {
  ArrowLeft, Award, BookOpen, CheckSquare, ChevronRight, Clock, CreditCard, ExternalLink, HelpCircle, Layers,
  LineChart, ListOrdered, MessageSquare, PenLine, PlayCircle, Rocket, Search, Settings, Shield, Sparkles,
  User, Users, Wallet, X, AlertCircle, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { RoleLayout } from "@/components/layout/RoleLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { setPageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getTourKey } from "@/components/tour/tourData";
import { dashboardPathForRole } from "@/lib/roleHome";
import type { Audience, CategoryId, Guide } from "@/help/types";
import {
  AUDIENCE_LABEL, CATEGORIES, POPULAR, canView, categoryInfo, getGuide, guidesFor, readMinutes, searchGuides,
} from "@/help/guides";
import { GuidePlayer } from "@/help/components/GuidePlayer";
import { TextSteps } from "@/help/components/TextSteps";
import { useReducedMotion } from "@/help/useReducedMotion";

const CAT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  rocket: Rocket, user: User, message: MessageSquare, book: BookOpen, award: Award, card: CreditCard, pen: PenLine,
  check: CheckSquare, chart: LineChart, users: Users, layers: Layers, wallet: Wallet, settings: Settings, shield: Shield,
};

const SWITCHER_ORDER: (Audience | "all")[] = ["all", "admin", "teacher", "student", "staff", "parent", "super_admin", "visitor"];

function toAudience(role: string | null | undefined): Audience {
  if (role === "admin" || role === "super_admin" || role === "teacher" || role === "student" || role === "staff" || role === "parent") return role;
  return "visitor";
}

const TEXT_PREF_KEY = "help:textSteps";
function readTextPref(): boolean | null {
  try { const v = localStorage.getItem(TEXT_PREF_KEY); return v === null ? null : v === "1"; } catch { return null; }
}
function writeTextPref(v: boolean) {
  try { localStorage.setItem(TEXT_PREF_KEY, v ? "1" : "0"); } catch { /* private mode */ }
}

export default function HelpPage() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  // Dashboard layouts already pad their content; the public layout does not.
  return user
    ? <RoleLayout><HelpCenter /></RoleLayout>
    : <PublicLayout><div className="px-4 py-6 sm:px-6 sm:py-8"><HelpCenter /></div></PublicLayout>;
}

function HelpCenter() {
  const { user } = useAuth();
  const viewer = toAudience(user?.role);
  const isAdmin = viewer === "admin" || viewer === "super_admin";
  const [, params] = useRoute<{ slug: string }>("/help/:slug");
  const search = useSearch();
  const [, setLocation] = useLocation();
  const qs = useMemo(() => new URLSearchParams(search), [search]);
  const slug = params?.slug;

  const forParam = qs.get("for") as Audience | "all" | null;
  const audience: Audience | "all" = isAdmin && forParam && (SWITCHER_ORDER as string[]).includes(forParam) ? forParam : viewer;

  useEffect(() => { window.scrollTo({ top: 0 }); }, [slug]);

  if (slug) return <GuideView slug={slug} viewer={viewer} from={qs.get("from")} audience={audience} />;
  return (
    <HelpHome
      viewer={viewer}
      audience={audience}
      firstName={user?.firstName ?? null}
      onAudience={(a) => setLocation(a === viewer ? "/help" : `/help?for=${a}`)}
    />
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────

function HelpHome({ viewer, audience, firstName, onAudience }: {
  viewer: Audience; audience: Audience | "all"; firstName: string | null; onAudience: (a: Audience | "all") => void;
}) {
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const isAdmin = viewer === "admin" || viewer === "super_admin";
  const signedIn = viewer !== "visitor";

  useEffect(() => {
    setPageMeta({ title: "Help Center", description: "Friendly, step-by-step guides for every part of SolomonQuest." });
  }, []);

  const pool = useMemo(() => guidesFor(audience), [audience]);
  const results = useMemo(() => searchGuides(pool, q), [pool, q]);
  const popular = useMemo(() => {
    const key = audience === "all" ? viewer : audience;
    return POPULAR[key].map(getGuide).filter((g): g is Guide => !!g && pool.includes(g));
  }, [audience, viewer, pool]);
  const cats = useMemo(() => CATEGORIES.filter((c) => pool.some((g) => g.category === c.id)), [pool]);
  const shownCats = cat === "all" ? cats : cats.filter((c) => c.id === cat);
  const animatedCount = pool.filter((g) => g.format === "animated").length;

  const heading = audience === "all"
    ? "Every guide, for every role"
    : audience === viewer
      ? firstName ? `How can we help, ${firstName}?` : "How can we help?"
      : `Guides for ${AUDIENCE_LABEL[audience].toLowerCase()}`;
  const sub = audience === "visitor"
    ? "New here? Find your school, apply, or accept an invitation."
    : `${pool.length} guides${audience === "all" ? "" : ` written for ${AUDIENCE_LABEL[audience].toLowerCase()}`} · ${animatedCount} with animated walkthroughs`;

  const replayTour = () => {
    try { localStorage.removeItem(getTourKey(viewer === "visitor" ? null : viewer)); } catch { /* ignore */ }
    setLocation(dashboardPathForRole(viewer));
  };

  return (
    <div className="mx-auto w-full max-w-5xl" data-testid="help-home">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-brand px-5 py-8 text-white sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-gold/20" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full border border-gold/30" aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Help Center</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight sm:text-4xl break-words">{heading}</h1>
        <p className="mt-2 text-sm text-white/75 sm:text-base">{sub}</p>
        <div className="relative mt-6 max-w-xl">
          <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all guides…"
            aria-label="Search help guides"
            className="h-12 rounded-xl border-0 bg-card pl-11 pr-10 text-base text-foreground shadow-lg"
            data-testid="help-search"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>

      {/* Admin role switcher */}
      {isAdmin && (
        <section className="mt-5 rounded-xl border border-border bg-card p-3 sm:p-4" data-testid="role-switcher">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Browse guides as</p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Show guides for">
            {SWITCHER_ORDER.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                onClick={() => onAudience(a)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  audience === a ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground/80 hover:border-gold/60",
                )}
              >
                {a === "all" ? "All roles" : AUDIENCE_LABEL[a]}
                {a === viewer && <span className="ml-1 text-[10px] opacity-70">(you)</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">As an admin you can open every guide, so you can help anyone at your school.</p>
        </section>
      )}

      {q.trim() ? (
        <section className="mt-6" aria-live="polite">
          <p className="mb-3 text-sm text-muted-foreground">
            {results.length} result{results.length === 1 ? "" : "s"} for “{q}”
          </p>
          {results.length ? (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="search-results">
              {results.map((g) => <GuideCard key={g.slug} g={g} showRoles={audience === "all"} />)}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <HelpCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
              <p className="font-medium">No guides match that yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a simpler word, like “quiz”, “grade” or “invite”.</p>
            </div>
          )}
        </section>
      ) : (
        <>
          {signedIn && (
            <button
              type="button"
              onClick={replayTour}
              className="mt-5 flex w-full items-center gap-4 rounded-2xl border border-gold/40 bg-gradient-to-r from-gold/10 to-transparent p-4 text-left transition-colors hover:from-gold/20 sm:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/20"><Sparkles className="h-5 w-5 text-foreground" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-lg font-semibold">Take the guided tour</span>
                <span className="block text-sm text-muted-foreground">A two-minute walk around your dashboard.</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          )}

          {popular.length > 0 && (
            <section className="mt-8" data-testid="popular">
              <h2 className="font-serif text-2xl font-semibold">Popular for you</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {popular.map((g) => <GuideCard key={g.slug} g={g} featured />)}
              </div>
            </section>
          )}

          <section className="mt-10">
            <h2 className="font-serif text-2xl font-semibold">Browse by topic</h2>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by topic">
              <TopicChip active={cat === "all"} onClick={() => setCat("all")}>All topics</TopicChip>
              {cats.map((c) => (
                <TopicChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.title}</TopicChip>
              ))}
            </div>
            <div className="mt-6 space-y-8">
              {shownCats.map((c) => {
                const Icon = CAT_ICONS[c.icon] ?? HelpCircle;
                const items = pool.filter((g) => g.category === c.id);
                return (
                  <div key={c.id} data-testid={`cat-${c.id}`}>
                    <div className="mb-3 flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <h3 className="font-serif text-xl font-semibold leading-tight">{c.title}</h3>
                        <p className="text-xs text-muted-foreground">{c.blurb}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {items.map((g) => <GuideCard key={g.slug} g={g} showRoles={audience === "all"} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TopicChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "border-gold bg-gold/20 font-medium text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FormatBadge({ g }: { g: Guide }) {
  return g.format === "animated" ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/80"><PlayCircle className="h-3.5 w-3.5 text-gold" />Animated</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/80"><ListOrdered className="h-3.5 w-3.5 text-primary" />Text steps</span>
  );
}

function GuideCard({ g, featured, showRoles }: { g: Guide; featured?: boolean; showRoles?: boolean }) {
  return (
    <Link
      href={`/help/${g.slug}`}
      data-testid={`guide-card-${g.slug}`}
      className={cn(
        "group flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md",
        featured ? "border-gold/40" : "border-border hover:border-gold/40",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="font-medium leading-snug text-foreground group-hover:text-primary break-words">{g.title}</span>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
      </span>
      <span className="text-sm text-muted-foreground leading-snug">{g.summary}</span>
      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
        <FormatBadge g={g} />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />{readMinutes(g)} min</span>
        {showRoles && g.roles.map((r) => (
          <span key={r} className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{AUDIENCE_LABEL[r]}</span>
        ))}
      </span>
    </Link>
  );
}

// ─── Guide ───────────────────────────────────────────────────────────────────

function GuideView({ slug, viewer, from, audience }: { slug: string; viewer: Audience; from: string | null; audience: Audience | "all" }) {
  const g = getGuide(slug);
  const reduced = useReducedMotion();
  const [textMode, setTextMode] = useState<boolean | null>(() => readTextPref());
  const backHref = from && from.startsWith("/") && !from.startsWith("//") ? from : null;
  const homeHref = audience !== viewer ? `/help?for=${audience}` : "/help";

  useEffect(() => {
    if (g) setPageMeta({ title: `${g.title} · Help`, description: g.summary });
  }, [g]);

  if (!g) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground/60" />
        <h1 className="mt-3 font-serif text-2xl font-semibold">We couldn't find that guide</h1>
        <p className="mt-1 text-muted-foreground">It may have moved. Try searching the Help Center.</p>
        <Button asChild className="mt-5"><Link href="/help">Go to the Help Center</Link></Button>
      </div>
    );
  }

  if (!canView(viewer, g)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground/60" />
        <h1 className="mt-3 font-serif text-2xl font-semibold">This guide is for {g.roles.map((r) => AUDIENCE_LABEL[r].toLowerCase()).join(", ")}</h1>
        <p className="mt-1 text-muted-foreground">It covers screens your account doesn't have. Here are the guides written for you.</p>
        <Button asChild className="mt-5"><Link href="/help">See my guides</Link></Button>
      </div>
    );
  }

  // Reduced motion: open on text steps unless the viewer explicitly chose the demo.
  const showText = g.format === "steps" || (textMode ?? reduced);
  const forViewer = g.roles.includes(viewer);
  const openHref = forViewer && viewer !== "visitor" && g.path && !g.path.includes(":") ? g.path : null;
  const related = (g.related ?? []).map(getGuide).filter((r): r is Guide => !!r && canView(viewer, r));
  const cat = categoryInfo(g.category);

  return (
    <article className="mx-auto w-full max-w-3xl" data-testid="guide-view" data-slug={g.slug}>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {backHref && (
          <Link href={backHref} className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary" data-testid="back-to-page">
            <ArrowLeft className="h-4 w-4" />Back to where you were
          </Link>
        )}
        <Link href={homeHref} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          {!backHref && <ArrowLeft className="h-4 w-4" />}Help Center
        </Link>
        <span className="text-muted-foreground/60" aria-hidden="true">/</span>
        <span className="text-muted-foreground">{cat.title}</span>
      </nav>

      <header className="mt-4">
        <h1 className="font-serif text-3xl font-semibold leading-tight sm:text-4xl break-words">{g.title}</h1>
        <p className="mt-2 text-base text-muted-foreground">{g.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="read-time"><Clock className="h-4 w-4" />{readMinutes(g)} min read</span>
          <FormatBadge g={g} />
          <span className="flex flex-wrap gap-1">
            {g.roles.map((r) => <Badge key={r} variant="outline" className="font-normal">{AUDIENCE_LABEL[r]}</Badge>)}
          </span>
        </div>
        {(g.where || openHref) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
            {g.where && <p className="min-w-0 text-sm"><span className="text-muted-foreground">Find it: </span><span className="font-medium break-words">{g.where}</span></p>}
            {openHref && (
              <Button asChild size="sm" variant="outline">
                <Link href={openHref}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open this page</Link>
              </Button>
            )}
          </div>
        )}
      </header>

      <section className="mt-6">
        {g.format === "animated" && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {showText ? "Step by step" : "Watch how it's done"}
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch
                checked={showText}
                onCheckedChange={(v) => { setTextMode(v); writeTextPref(v); }}
                aria-label="Show as text steps"
                data-testid="text-toggle"
              />
              Show as text steps
            </label>
          </div>
        )}
        {g.format === "animated" && reduced && !showText && (
          <p className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="reduced-note">
            Your device asks for reduced motion, so the demo won't move by itself. Use Next and Back to step through.
          </p>
        )}
        {showText ? <TextSteps steps={g.steps} /> : <GuidePlayer guide={g} reduced={reduced} staffNav={audience === "staff" || (audience !== "student" && viewer === "staff")} />}
      </section>

      {g.troubleshoot && g.troubleshoot.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif text-2xl font-semibold">If something goes wrong</h2>
          <div className="mt-3 space-y-3">
            {g.troubleshoot.map((t) => (
              <div key={t.problem} className="rounded-xl border border-border bg-card p-4">
                <p className="flex items-start gap-2 font-medium"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />{t.problem}</p>
                <p className="mt-1.5 flex items-start gap-2 text-sm text-foreground/80"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />{t.fix}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif text-2xl font-semibold">Related guides</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {related.map((r) => <GuideCard key={r.slug} g={r} />)}
          </div>
        </section>
      )}

      <section className="mt-10 rounded-2xl border border-border bg-card p-5 text-center">
        <HelpCircle className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-2 font-serif text-lg font-semibold">Still stuck?</p>
        {viewer === "visitor" ? (
          <p className="mt-1 text-sm text-muted-foreground">Contact the school you're joining. Their details are on their public page.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">Ask in the Forum, or message your school's administrator.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {viewer !== "parent" && <Button asChild size="sm" variant="outline"><Link href="/forum">Open Forum</Link></Button>}
              <Button asChild size="sm" variant="outline"><Link href="/messages">Send a message</Link></Button>
            </div>
          </>
        )}
      </section>
    </article>
  );
}
