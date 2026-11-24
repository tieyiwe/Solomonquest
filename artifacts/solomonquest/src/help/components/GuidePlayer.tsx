/**
 * Animated step-by-step demo for a guide: a scaled mini mock of the screen,
 * a cursor that glides to each step's target, a click ripple and a gold
 * pulse ring, plus captions and Play/Pause/Back/Next with auto-advance.
 *
 * Reduced motion: never auto-plays, no cursor travel, no typing, no pulse;
 * the page also opens on the text-steps view by default.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Guide, MockState } from "../types";
import { MockScreenView } from "./MockScreen";
import "../help.css";

const STEP_MS = 4200;
const TYPE_MS = 45;

interface Frame {
  screenKey: string;
  state: MockState;
  /** Same as `state` but with this step's closings (open:false) not yet applied,
   *  so the cursor can still "click" a button inside a dialog the step closes. */
  beforeClose: MockState;
  typing: Set<string>;
  typedChars: number;
}

/** Resolve every step to the screen and accumulated element state it shows. */
export function buildFrames(guide: Guide): Frame[] {
  const keys = Object.keys(guide.screens ?? {});
  let screenKey = keys[0] ?? "";
  let acc: MockState = {};
  return guide.steps.map((s) => {
    if (s.screen) screenKey = s.screen;
    const typing = new Set<string>();
    let typedChars = 0;
    const next: MockState = { ...acc };
    const before: MockState = { ...acc };
    for (const [id, patch] of Object.entries(s.set ?? {})) {
      const prev = acc[id] ?? {};
      if (typeof patch.value === "string" && patch.value !== prev.value) {
        typing.add(id);
        typedChars += patch.value.length;
      }
      next[id] = { ...prev, ...patch };
      before[id] = patch.open === false && prev.open === true ? { ...prev, ...patch, open: true } : next[id];
    }
    acc = next;
    return { screenKey, state: acc, beforeClose: before, typing, typedChars };
  });
}

interface Box { x: number; y: number; w: number; h: number }

export function GuidePlayer({ guide, reduced, staffNav = false }: { guide: Guide; reduced: boolean; /** Show the staff version of the student sidebar. */ staffNav?: boolean }) {
  const frames = useMemo(() => buildFrames(guide), [guide]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [box, setBox] = useState<Box | null>(null);
  const [press, setPress] = useState(0);
  // Closings (e.g. a dialog's Save) happen just after the cursor clicks.
  const [closed, setClosed] = useState(false);
  const [ringHidden, setRingHidden] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  const [stageH, setStageH] = useState(420);

  const step = guide.steps[i];
  const frame = frames[i];
  const screen = guide.screens?.[frame.screenKey];
  const narrow = wrapW > 0 && wrapW < 600;
  const designW = narrow ? 380 : 640;
  const scale = wrapW ? Math.min(1, wrapW / designW) : 1;
  const last = i === guide.steps.length - 1;
  const drawerOpen = narrow && !!step.target?.startsWith("nav:");
  const stepMs = STEP_MS + frame.typedChars * TYPE_MS;

  // Reset when the guide changes (deep link to another guide)
  useEffect(() => { setI(0); setPlaying(!reduced); }, [guide.slug, reduced]);

  // Measure available width and stage height
  useLayoutEffect(() => {
    const w = wrapRef.current;
    const s = stageRef.current;
    if (!w || !s) return;
    const ro = new ResizeObserver(() => {
      setWrapW(w.clientWidth);
      setStageH(s.offsetHeight);
    });
    ro.observe(w);
    ro.observe(s);
    setWrapW(w.clientWidth);
    setStageH(s.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Locate the target in unscaled stage coordinates
  const locate = useCallback(() => {
    const s = stageRef.current;
    if (!s || !step.target) { setBox(null); return; }
    const el = s.querySelector<HTMLElement>(`[data-mid="${CSS.escape(step.target)}"]`);
    if (!el) {
      // The step's click closed the dialog holding the target: leave the cursor where it clicked.
      if (closed) setRingHidden(true); else setBox(null);
      return;
    }
    setRingHidden(false);
    const sr = s.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setBox({ x: (r.left - sr.left) / scale, y: (r.top - sr.top) / scale, w: r.width / scale, h: r.height / scale });
  }, [step.target, scale, closed]);

  useLayoutEffect(() => {
    locate();
    // overlays (dialogs/menus/drawer) pop in; re-measure once they settle
    const t = window.setTimeout(locate, 340);
    return () => window.clearTimeout(t);
  }, [locate, i, narrow, stageH]);

  useEffect(() => {
    setClosed(false);
    if (reduced) return;
    const t = window.setTimeout(() => setClosed(true), 1100);
    return () => window.clearTimeout(t);
  }, [i, reduced]);
  const shownState = closed ? frame.state : frame.beforeClose;

  // Click "press" a moment after the cursor arrives
  useEffect(() => {
    if (reduced || !step.target) return;
    const t = window.setTimeout(() => setPress((p) => p + 1), 720);
    return () => window.clearTimeout(t);
  }, [i, reduced, step.target]);

  // Auto-advance
  useEffect(() => {
    if (!playing || reduced) return;
    const t = window.setTimeout(() => {
      if (last) setPlaying(false);
      else setI((n) => n + 1);
    }, stepMs);
    return () => window.clearTimeout(t);
  }, [playing, reduced, i, last, stepMs]);

  const go = (n: number) => setI(Math.max(0, Math.min(guide.steps.length - 1, n)));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); go(i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); go(i - 1); }
  };

  if (!screen) return null;

  // keep the pointer inside the stage (e.g. the avatar sits at the right edge)
  const cursorX = Math.min(designW - 22, box ? box.x + Math.min(box.w * 0.62, box.w - 4) : designW * 0.7);
  const cursorY = box ? box.y + box.h * 0.6 : stageH * 0.8;

  return (
    <div className={cn("space-y-3", reduced && "help-static")} onKeyDown={onKey} data-testid="guide-player">
      <div ref={wrapRef} className="relative w-full overflow-hidden" style={{ height: stageH * scale }}>
        <div
          ref={stageRef}
          aria-hidden="true"
          className="absolute top-0"
          style={{
            width: designW,
            left: scale >= 1 && wrapW > designW ? (wrapW - designW) / 2 : 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <MockScreenView
            screen={screen}
            state={shownState}
            narrow={narrow}
            typing={frame.typing}
            reduced={reduced}
            drawerOpen={drawerOpen}
            staffNav={staffNav}
          />
          {box && !ringHidden && (
            <div
              className="help-ring"
              data-testid="help-ring"
              style={{ left: box.x - 3, top: box.y - 3, width: box.w + 6, height: box.h + 6 }}
            />
          )}
          <div
            className="help-cursor"
            data-testid="help-cursor"
            style={{ transform: `translate(${cursorX}px, ${cursorY}px)`, opacity: box || !reduced ? 1 : 0 }}
          >
            {!reduced && press > 0 && step.target && <span key={press} className="help-ripple" />}
            <svg key={`p-${press}`} width="20" height="22" viewBox="0 0 20 22" className={cn("relative", press > 0 && !reduced && "help-press")}>
              <path d="M3 2 L3 17 L7 13.5 L9.8 19.6 L12.6 18.4 L9.9 12.4 L15 12 Z" fill="hsl(222 44% 11%)" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Step {i + 1} of {guide.steps.length}</span>
          <span className="flex gap-1" role="tablist" aria-label="Steps">
            {guide.steps.map((s, n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={n === i}
                aria-label={`Step ${n + 1}: ${s.title}`}
                onClick={() => { setPlaying(false); go(n); }}
                className={cn("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-gold" : n < i ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted-foreground/30")}
              />
            ))}
          </span>
        </div>
        <p className="mt-1.5 font-serif text-lg font-semibold leading-snug" data-testid="caption-title">{step.title}</p>
        <p className="mt-0.5 text-sm text-foreground/85">{step.text}</p>
        {step.tip && <p className="mt-2 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-xs text-foreground/80">Tip: {step.tip}</p>}
        {playing && !reduced && (
          <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-muted">
            <div key={`${i}-${playing}`} className="help-step-progress h-full bg-gold" style={{ animationDuration: `${stepMs}ms` }} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => { setPlaying(false); go(i - 1); }} disabled={i === 0} aria-label="Previous step">
          <ChevronLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Back</span>
        </Button>
        {last && !playing ? (
          <Button size="sm" variant="secondary" onClick={() => { go(0); if (!reduced) setPlaying(true); }} data-testid="player-replay">
            <RotateCcw className="h-4 w-4 mr-1.5" />Replay
          </Button>
        ) : (
          <Button size="sm" onClick={() => setPlaying((p) => !p)} data-testid="player-toggle" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <><Pause className="h-4 w-4 mr-1.5" />Pause</> : <><Play className="h-4 w-4 mr-1.5" />Play</>}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => { setPlaying(false); go(i + 1); }} disabled={last} aria-label="Next step" data-testid="player-next">
          <span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4 sm:ml-1" />
        </Button>
      </div>
    </div>
  );
}
