/**
 * School branding inside the app.
 *
 * A signed-in user of a school sees that school's primary colour, accent
 * colour and corner radius in place of the platform's navy / gold tokens.
 * This module turns the school's hex colours into the HSL triplets
 * index.css uses ("222 44% 14%"), checks WCAG contrast and nudges the
 * lightness of a colour that would be unreadable as a button / link / nav
 * colour, and builds one <style> block with a light and a dark variant.
 *
 * Fonts are not themed here: only Inter is loaded inside the app, so school
 * fonts stay on the public school page.
 */

export type Rgb = [number, number, number];
export type Hsl = [number, number, number];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function hexToRgb(hex: string): Rgb | null {
  if (!HEX_RE.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

export function rgbToHsl([r, g, b]: Rgb): Hsl {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

export function hslToRgb([h, s, l]: Hsl): Rgb {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function luminance([r, g, b]: Rgb): number {
  const c = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

export function contrast(a: Hsl, b: Hsl): number {
  const la = luminance(hslToRgb(a)), lb = luminance(hslToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** "222 44% 14%" — the triplet format index.css's tokens use. */
export function triplet([h, s, l]: Hsl): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

export function hslHex(c: Hsl): string {
  return rgbToHex(hslToRgb(c));
}

// Surfaces from index.css the school colours are drawn on.
const BG_LIGHT: Hsl = [40, 30, 98];
const BG_DARK: Hsl = [222, 38, 6];
const WHITE: Hsl = [0, 0, 100];
const INK: Hsl = [222, 44, 8]; // near-black used for text on light fills

export const MIN_TEXT_CONTRAST = 4.5;

/** White or near-black, whichever reads better on `bg`. */
export function readableOn(bg: Hsl): Hsl {
  return contrast(WHITE, bg) >= contrast(INK, bg) ? WHITE : INK;
}

/**
 * Move `c`'s lightness in `dir` (−1 darker, +1 lighter) one point at a time
 * until `ok(c)` holds. Returns the colour and whether it had to change.
 */
function nudge(c: Hsl, dir: -1 | 1, ok: (c: Hsl) => boolean): { color: Hsl; adjusted: boolean } {
  let cur: Hsl = [...c];
  let adjusted = false;
  for (let i = 0; i < 100 && !ok(cur); i++) {
    const l = cur[2] + dir;
    if (l < 0 || l > 100) break;
    cur = [cur[0], cur[1], l];
    adjusted = true;
  }
  return { color: cur, adjusted };
}

/** A fill colour plus the text colour that sits on it (≥ 4.5:1). */
function fillWithText(c: Hsl): { fill: Hsl; text: Hsl; adjusted: boolean } {
  const good = (x: Hsl) => contrast(x, readableOn(x)) >= MIN_TEXT_CONTRAST;
  if (good(c)) return { fill: c, text: readableOn(c), adjusted: false };
  // Mid-tones: step away from the middle towards whichever end is closer.
  const r = nudge(c, c[2] >= 50 ? 1 : -1, good);
  return { fill: r.color, text: readableOn(r.color), adjusted: true };
}

export type SchoolRadius = "sharp" | "rounded" | "pill";

export interface SchoolThemeInput {
  primary: string;
  accent?: string | null;
  radius?: SchoolRadius | null;
}

export interface ModeTokens {
  primary: Hsl; primaryFg: Hsl;
  sidebar: Hsl; sidebarFg: Hsl; sidebarAccent: Hsl; sidebarAccentFg: Hsl;
  sidebarPrimary: Hsl; sidebarPrimaryFg: Hsl;
  gold: Hsl; goldFg: Hsl;
  accentTint: Hsl; accentTintFg: Hsl;
}

export interface SchoolTheme {
  light: ModeTokens;
  dark: ModeTokens;
  radius: string;
  /** Plain-language notes on colours that had to be adjusted for contrast. */
  warnings: string[];
}

const RADIUS: Record<SchoolRadius, string> = { sharp: "0rem", rounded: ".5rem", pill: "1.25rem" };

function modeTokens(primary: Hsl, accent: Hsl, dark: boolean, warn: (m: string) => void): ModeTokens {
  const bg = dark ? BG_DARK : BG_LIGHT;

  // Primary: buttons (fill + text), links (text on the page) and focus rings.
  // It has to read as text on the page background, which also guarantees a
  // ≥ 4.5:1 white-or-ink label when it is used as a button fill.
  const onPage = (c: Hsl) => contrast(c, bg) >= MIN_TEXT_CONTRAST && contrast(c, readableOn(c)) >= MIN_TEXT_CONTRAST;
  const p = nudge(primary, dark ? 1 : -1, onPage);
  if (p.adjusted) warn(`Primary colour was ${dark ? "lightened" : "darkened"} to ${hslHex(p.color)} in ${dark ? "dark" : "light"} mode so buttons and links stay readable.`);

  // Sidebar: a deep surface tinted with the school's hue, near-white text.
  const sat = Math.min(primary[1], 40);
  const sidebar: Hsl = [primary[0], sat, dark ? 5 : 11];
  const sidebarFg: Hsl = [primary[0], 15, 88];

  // Active nav item: the school's own primary as the pill behind the label.
  // The label is the light sidebar text, so the pill must be dark enough for
  // it, but still visibly lighter than the sidebar itself.
  const activeFg: Hsl = [0, 0, 98];
  let active = nudge(primary, -1, (c) => contrast(c, activeFg) >= MIN_TEXT_CONTRAST).color;
  if (active[2] < sidebar[2] + 9) active = [active[0], Math.max(active[1], 30), sidebar[2] + 11];

  // Accent: replaces the platform gold. As the nav indicator / active icon it
  // must stand out (≥ 3:1) on both the sidebar and the active pill; as a fill
  // (badges, brand tile) it carries white or ink text at ≥ 4.5:1.
  const graphic = (c: Hsl) => contrast(c, sidebar) >= 3 && contrast(c, active) >= 3 && contrast(c, readableOn(c)) >= MIN_TEXT_CONTRAST;
  const sp = nudge(accent, 1, graphic);
  const gold = fillWithText(accent);
  if (gold.adjusted && !dark) warn(`Accent colour was adjusted to ${hslHex(gold.fill)} so text on it stays readable.`);

  const tint: Hsl = dark ? [primary[0], Math.min(primary[1], 30), 16] : [primary[0], Math.min(primary[1], 35), 94];
  const tintFg = nudge(p.color, dark ? 1 : -1, (c) => contrast(c, tint) >= MIN_TEXT_CONTRAST).color;

  return {
    primary: p.color, primaryFg: readableOn(p.color),
    sidebar, sidebarFg, sidebarAccent: active, sidebarAccentFg: activeFg,
    sidebarPrimary: sp.color, sidebarPrimaryFg: readableOn(sp.color),
    gold: gold.fill, goldFg: gold.text,
    accentTint: tint, accentTintFg: tintFg,
  };
}

export function buildSchoolTheme(input: SchoolThemeInput): SchoolTheme | null {
  const pRgb = hexToRgb(input.primary);
  if (!pRgb) return null;
  const primary = rgbToHsl(pRgb);
  const aRgb = input.accent ? hexToRgb(input.accent) : null;
  const accent: Hsl = aRgb ? rgbToHsl(aRgb) : [39, 52, 56]; // platform gold
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  return {
    light: modeTokens(primary, accent, false, warn),
    dark: modeTokens(primary, accent, true, warn),
    radius: RADIUS[input.radius ?? "rounded"] ?? RADIUS.rounded,
    warnings,
  };
}

function block(t: ModeTokens, radius: string): string {
  const rgb = hslToRgb(t.primary).map(Math.round).join(", ");
  const v: Record<string, string> = {
    "--primary": triplet(t.primary),
    "--primary-foreground": triplet(t.primaryFg),
    "--primary-rgb": rgb,
    "--ring": triplet(t.primary),
    "--accent": triplet(t.accentTint),
    "--accent-foreground": triplet(t.accentTintFg),
    "--gold": triplet(t.gold),
    "--gold-foreground": triplet(t.goldFg),
    "--sidebar": triplet(t.sidebar),
    "--sidebar-foreground": triplet(t.sidebarFg),
    "--sidebar-border": triplet([t.sidebar[0], t.sidebar[1], t.sidebar[2] + 8]),
    "--sidebar-accent": triplet(t.sidebarAccent),
    "--sidebar-accent-foreground": triplet(t.sidebarAccentFg),
    "--sidebar-primary": triplet(t.sidebarPrimary),
    "--sidebar-primary-foreground": triplet(t.sidebarPrimaryFg),
    "--sidebar-ring": triplet(t.sidebarPrimary),
    "--radius": radius,
  };
  return Object.entries(v).map(([k, val]) => `${k}:${val};`).join("");
}

/** The CSS for one school: light tokens, then dark tokens. Values are all
 *  numbers we generated, never text from the school, so nothing can escape. */
export function schoolThemeCss(theme: SchoolTheme): string {
  return `:root:not(.dark){${block(theme.light, theme.radius)}}:root.dark{${block(theme.dark, theme.radius)}}`;
}

// ── Reading a school record ─────────────────────────────────────────────────

type SchoolLike = Record<string, unknown> | null | undefined;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/** The school's colours / radius, from its columns and its branding JSON. */
export function themeInputFromSchool(school: SchoolLike): SchoolThemeInput | null {
  if (!school) return null;
  const b = (school.branding as Record<string, unknown> | undefined) ?? {};
  const primary = str(school.primary_color) ?? str(school.primaryColor);
  if (!primary || !HEX_RE.test(primary)) return null;
  const accent = str(b.accent_color) ?? str(school.accent_color);
  const radius = (str(b.border_radius) ?? str(school.border_radius)) as SchoolRadius | undefined;
  return {
    primary,
    accent: accent && HEX_RE.test(accent) ? accent : null,
    radius: radius && radius in RADIUS ? radius : "rounded",
  };
}

export function schoolLogoUrl(school: SchoolLike): string | undefined {
  if (!school) return undefined;
  const url = str(school.logo_url) ?? str(school.logoUrl);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

// ── Applying it ─────────────────────────────────────────────────────────────

export const THEME_STYLE_ID = "sq-school-theme";
export const THEME_CACHE_KEY = "sq-school-theme";

/** Routes that render inside a role layout, where the school's theme applies.
 *  Public pages (home, auth, the school's own public page, verify, …) and
 *  the super admin console keep the platform theme. Keep in sync with the
 *  boot script in index.html. */
export const THEMED_ROUTE_RE = /^\/(dashboard|chat|forum|messages|calendar|settings|notifications|profile|reports|help)(\/|$)/;

export function applyThemeCss(css: string | null): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = THEME_STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

export interface ThemeCache { userId: string; schoolId: string; css: string }

export function readThemeCache(): ThemeCache | null {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.css === "string" && v.userId && v.schoolId ? v : null;
  } catch {
    return null;
  }
}

export function writeThemeCache(v: ThemeCache | null): void {
  try {
    if (v) localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(v));
    else localStorage.removeItem(THEME_CACHE_KEY);
  } catch {
    /* storage unavailable */
  }
}
