import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { sizedImageUrl } from "@/components/common/SafeImage";

export interface HeroSlide {
  id: string;
  eyebrow: string;
  /** Optional line shown right under the eyebrow (e.g. who the platform is by). */
  byline?: ReactNode;
  title: ReactNode;
  body: string;
  /** Optional photo. Each slide is designed to look finished without one, so a
   *  missing or blocked image degrades to the gradient instead of a broken box. */
  image?: string;
  /** Decorative element rendered on the right on wide screens (e.g. a crest). */
  art?: ReactNode;
  actions: ReactNode;
}

const INTERVAL_MS = 7000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function HeroSlideshow({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const autoplay = !paused && !reducedMotion && slides.length > 1;

  const go = useCallback((next: number) => setIndex((next + slides.length) % slides.length), [slides.length]);

  useEffect(() => {
    if (!autoplay) return;
    const t = window.setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [autoplay, index, go]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Horizontal, deliberate swipes only, so vertical page scrolling never flips slides.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") go(index + 1);
    if (e.key === "ArrowLeft") go(index - 1);
  };

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Highlights"
      className="relative isolate overflow-hidden bg-brand text-[hsl(40_30%_97%)] min-h-[max(520px,calc(100svh-8.75rem-env(safe-area-inset-bottom,0px)))] sm:min-h-[560px] md:min-h-[640px] lg:min-h-[700px] flex"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setPaused(false);
      }}
      onKeyDown={onKeyDown}
    >
      {slides.map((slide, i) => {
        const active = i === index;
        return (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
            aria-hidden={!active}
            className={`absolute inset-0 flex transition-opacity duration-[1200ms] ease-out ${active ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}
            {...(!active ? { inert: "" as unknown as boolean } : {})}
          >
            {slide.image && (
              <div
                aria-hidden="true"
                className={`absolute inset-0 bg-cover bg-center opacity-35 ${active && !reducedMotion ? "hero-kenburns" : ""}`}
                style={{ backgroundImage: `url(${sizedImageUrl(slide.image)})` }}
              />
            )}
            {/* Legibility + atmosphere: deep fade from the left, warm glow top-right, fine grain. */}
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[hsl(224_50%_5%/0.92)] via-[hsl(222_44%_9%/0.7)] to-[hsl(222_44%_11%/0.25)]" />
            <div aria-hidden="true" className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,hsl(39_55%_62%/0.18),transparent_65%)]" />
            <div aria-hidden="true" className="absolute inset-0 hero-grain opacity-[0.07] mix-blend-overlay" />

            <div className="relative z-10 container mx-auto max-w-6xl px-5 sm:px-6 flex items-end sm:items-center pt-16 pb-28 sm:pt-20 sm:pb-32 md:py-28 w-full">
              <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-12 items-center w-full">
                <div className={`max-w-2xl space-y-6 ${active && !reducedMotion ? "hero-rise" : ""}`}>
                  <div className="space-y-2.5">
                    <p className="flex items-center gap-3 text-[11px] sm:text-xs font-semibold tracking-[0.28em] uppercase text-gold">
                      <span aria-hidden="true" className="h-px w-10 bg-gold/70" />
                      {slide.eyebrow}
                    </p>
                    {slide.byline && (
                      <p className="pl-[52px] font-serif italic text-base sm:text-lg text-[hsl(40_20%_88%/0.85)]">{slide.byline}</p>
                    )}
                  </div>
                  <h2 className="font-serif font-semibold text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-7xl tracking-tight text-balance">
                    {slide.title}
                  </h2>
                  <p className="text-base sm:text-lg md:text-xl text-[hsl(40_20%_88%/0.85)] leading-relaxed max-w-xl">
                    {slide.body}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 pt-3">{slide.actions}</div>
                </div>
                {slide.art && <div className="hidden lg:flex justify-center" aria-hidden="true">{slide.art}</div>}
              </div>
            </div>
          </div>
        );
      })}

      {slides.length > 1 && (
        <div className="absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-8 inset-x-0 z-20">
          <div className="container mx-auto max-w-6xl px-5 sm:px-6 flex items-center justify-between gap-6">
            <div className="flex items-center gap-2 sm:gap-3" role="tablist" aria-label="Choose slide">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Show slide ${i + 1}: ${s.eyebrow}`}
                  onClick={() => go(i)}
                  className="group relative h-11 sm:h-8 flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <span className="block h-[3px] sm:h-[2px] w-12 sm:w-16 bg-white/20 overflow-hidden rounded-full">
                    <span
                      key={i === index ? `active-${index}` : `idle-${i}`}
                      className={`block h-full bg-gold origin-left ${
                        i === index
                          ? autoplay
                            ? "hero-progress"
                            : "w-full"
                          : i < index
                            ? "w-full opacity-40"
                            : "w-0"
                      }`}
                      style={i === index && autoplay ? { animationDuration: `${INTERVAL_MS}ms` } : undefined}
                    />
                  </span>
                </button>
              ))}
              <span className="ml-2 text-xs tabular text-white/60 hidden sm:inline">
                {String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label="Previous slide"
                className="h-10 w-10 rounded-full border border-white/20 text-white/80 hover:text-white hover:border-gold/70 hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label="Next slide"
                className="h-10 w-10 rounded-full border border-white/20 text-white/80 hover:text-white hover:border-gold/70 hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="sr-only" aria-live={autoplay ? "off" : "polite"}>
        Slide {index + 1} of {slides.length}: {slides[index]?.eyebrow}
      </p>
    </section>
  );
}
