import { useEffect, useState } from "react";

/**
 * Tracks the visual viewport (the part of the page not covered by the
 * on-screen keyboard). iOS Safari doesn't shrink the layout viewport — or
 * 100dvh — when the keyboard opens, it scrolls the page under it instead, so
 * a composer pinned to the bottom of a 100dvh layout ends up behind the
 * keyboard. Sizing the chat shell to visualViewport.height and offsetting it
 * by visualViewport.offsetTop keeps the composer right above the keyboard.
 */
export function useVisualViewport(enabled: boolean): { height: number; offsetTop: number } | null {
  const [vv, setVv] = useState<{ height: number; offsetTop: number } | null>(null);

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !v) {
      setVv(null);
      return;
    }
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setVv((prev) => {
          const next = { height: Math.round(v.height), offsetTop: Math.max(0, Math.round(v.offsetTop)) };
          return prev && prev.height === next.height && prev.offsetTop === next.offsetTop ? prev : next;
        });
      });
    };
    update();
    v.addEventListener("resize", update);
    v.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("resize", update);
      v.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return vv;
}
