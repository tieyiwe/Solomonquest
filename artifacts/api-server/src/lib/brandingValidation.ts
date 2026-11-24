/**
 * Validation for PUT /schools/:id/branding. Every field is optional (the
 * route merges what it is sent into what is stored), but a field that IS
 * sent must be well formed:
 *   - colours are #RRGGBB
 *   - URLs are http(s) (a slide's button may also link to a site path "/…")
 *   - fonts come from the same lists the branding page offers
 *   - text and lists are length-capped, list items keep only known keys
 *   - custom CSS cannot contain "<" (so no "</style>"), @import or script URLs
 * Returns the cleaned values, or the first problem found.
 */

export const HEADING_FONTS = ["Inter", "Poppins", "Montserrat", "Playfair Display", "Merriweather", "Lora", "Raleway"];
export const BODY_FONTS = ["Inter", "Open Sans", "Roboto", "Lato", "Source Sans Pro"];
const ANIMATIONS = ["fade", "slide", "zoom", "none"];
const RADII = ["sharp", "rounded", "pill"];

const HEX = /^#[0-9a-fA-F]{6}$/;

class BrandingError extends Error {}
const fail = (msg: string): never => {
  throw new BrandingError(msg);
};

function text(v: unknown, field: string, max: number): string {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") fail(`${field} must be text`);
  const s = (v as string).trim();
  if (s.length > max) fail(`${field} must be ${max} characters or fewer`);
  return s;
}

function color(v: unknown, field: string): string {
  if (typeof v !== "string" || !HEX.test(v)) fail(`${field} must be a colour like #1a2b3c`);
  return (v as string).toLowerCase();
}

function url(v: unknown, field: string, { allowPath = false } = {}): string {
  const s = text(v, field, 2048);
  if (!s) return "";
  if (allowPath && s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return s;
  } catch {
    /* fall through */
  }
  return fail(`${field} must be a web address starting with https://`);
}

function bool(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") fail(`${field} must be true or false`);
  return v as boolean;
}

function list(v: unknown, field: string, max: number): Record<string, unknown>[] {
  if (!Array.isArray(v)) fail(`${field} must be a list`);
  const arr = v as unknown[];
  if (arr.length > max) fail(`${field} can have at most ${max} items`);
  return arr.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail(`${field} items must be objects`);
    return item as Record<string, unknown>;
  });
}

const id = (v: unknown) => (typeof v === "string" && v.length <= 64 ? v : undefined);
const icon = (v: unknown) => (typeof v === "string" && /^[A-Za-z]{1,32}$/.test(v) ? v : undefined);

export function cleanCustomCss(v: unknown): string {
  const css = text(v, "Custom CSS", 20000);
  if (css.includes("<")) fail("Custom CSS can't contain '<' (HTML tags aren't allowed)");
  if (/@import/i.test(css)) fail("Custom CSS can't use @import");
  if (/expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(css)) fail("Custom CSS contains a disallowed construct");
  return css;
}

/** Cleans the fields of a branding request body that are present. */
export function validateBranding(body: Record<string, unknown>):
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  const has = (k: string) => body[k] !== undefined;
  try {
    if (has("logo_url")) out.logo_url = url(body.logo_url, "Logo") || null;
    if (has("tagline")) out.tagline = text(body.tagline, "Tagline", 160);
    for (const k of ["primary_color", "secondary_color", "accent_color", "heading_text_color", "announcement_bg_color"]) {
      if (has(k)) out[k] = color(body[k], k.replace(/_/g, " "));
    }
    if (has("heading_font")) {
      if (!HEADING_FONTS.includes(body.heading_font as string)) fail("Heading font is not one of the offered fonts");
      out.heading_font = body.heading_font;
    }
    if (has("body_font")) {
      if (!BODY_FONTS.includes(body.body_font as string)) fail("Body font is not one of the offered fonts");
      out.body_font = body.body_font;
    }
    if (has("border_radius")) {
      if (!RADII.includes(body.border_radius as string)) fail("Border radius must be sharp, rounded or pill");
      out.border_radius = body.border_radius;
    }
    if (has("hero_settings")) {
      const h = body.hero_settings as Record<string, unknown>;
      if (!h || typeof h !== "object") fail("hero settings must be an object");
      const animation = h.animation ?? "fade";
      if (!ANIMATIONS.includes(animation as string)) fail("Hero animation must be fade, slide, zoom or none");
      const interval = Number(h.interval_seconds ?? 5);
      if (!Number.isFinite(interval) || interval < 2 || interval > 60) fail("Slide interval must be 2–60 seconds");
      out.hero_settings = { animation, auto_advance: h.auto_advance === undefined ? true : bool(h.auto_advance, "Auto-advance"), interval_seconds: interval };
    }
    if (has("banner_slides")) {
      out.banner_slides = list(body.banner_slides, "Slides", 6).map((s, i) => {
        const n = `Slide ${i + 1}`;
        const opacity = Number(s.overlay_opacity ?? 40);
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) fail(`${n} overlay opacity must be 0–100`);
        return {
          id: id(s.id),
          image_url: url(s.image_url, `${n} image`),
          title: text(s.title, `${n} title`, 120),
          subtitle: text(s.subtitle, `${n} subtitle`, 240),
          cta_text: text(s.cta_text ?? s.cta_label, `${n} button text`, 40),
          cta_url: url(s.cta_url, `${n} button link`, { allowPath: true }),
          overlay_color: s.overlay_color === undefined ? "#000000" : color(s.overlay_color, `${n} overlay colour`),
          overlay_opacity: opacity,
        };
      });
    }
    if (has("stats_visible")) out.stats_visible = bool(body.stats_visible, "Stats visibility");
    if (has("stats")) {
      out.stats = list(body.stats, "Stats", 6).map((s) => ({
        id: id(s.id), icon: icon(s.icon), label: text(s.label, "Stat label", 40), value: text(s.value, "Stat value", 20),
      }));
    }
    if (has("features")) {
      out.features = list(body.features, "Features", 6).map((f) => ({
        id: id(f.id), icon: icon(f.icon), title: text(f.title, "Feature title", 80), description: text(f.description, "Feature description", 400),
      }));
    }
    if (has("testimonials")) {
      out.testimonials = list(body.testimonials, "Testimonials", 4).map((t) => ({
        id: id(t.id), name: text(t.name, "Testimonial name", 80), role: text(t.role, "Testimonial role", 80),
        quote: text(t.quote, "Testimonial quote", 600), avatar_url: url(t.avatar_url, "Testimonial avatar"),
      }));
    }
    if (has("show_announcement")) out.show_announcement = bool(body.show_announcement, "Show announcement");
    if (has("announcement_text")) out.announcement_text = text(body.announcement_text, "Announcement", 200);
    for (const k of ["social_website", "social_facebook", "social_twitter", "social_instagram", "social_linkedin", "social_youtube"]) {
      if (has(k)) out[k] = url(body[k], k.replace("social_", "") + " link");
    }
    if (has("custom_css")) out.custom_css = cleanCustomCss(body.custom_css);
    return { ok: true, values: out };
  } catch (e) {
    if (e instanceof BrandingError) return { ok: false, error: e.message };
    throw e;
  }
}
