import { Fragment, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/common/SafeImage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * A deliberately small markdown renderer for lesson bodies. It builds React
 * elements only (no dangerouslySetInnerHTML), so any HTML a teacher types is
 * shown as literal text. Supports: # / ## / ### headings, - or * bullet
 * lists, 1. numbered lists, > quotes, ``` code blocks, blank-line
 * paragraphs, **bold**, *italic*, `code`, [text](https://link) and
 * ![alt text](https://image) images (see safeImageSrc for what is allowed).
 */

function safeHref(url: string): string | null {
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Public URL prefix of this project's `course-resources` storage bucket. */
const COURSE_RESOURCES_PREFIX = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/storage/v1/object/public/course-resources/`;

/**
 * The only image sources a lesson may show: absolute http(s) URLs, or a file
 * in this project's course-resources bucket written as
 * `course-resources/courses/<courseId>/...`. Everything else (javascript:,
 * data:, blob:, relative paths, protocol-relative //host) returns null and is
 * not rendered.
 */
export function safeImageSrc(raw: string): string | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  if (/^course-resources\/courses\/[^\s]+$/.test(url) && !url.includes("..") && COURSE_RESOURCES_PREFIX.startsWith("http")) {
    return COURSE_RESOURCES_PREFIX + url.slice("course-resources/".length);
  }
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** A lesson image: responsive, lazy-loaded, opens full size in a lightbox,
 *  and shows a tidy placeholder (never a broken-image icon) if it fails. */
function LessonImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const fallback = (
    <span
      role="img"
      aria-label={alt ? `Image unavailable: ${alt}` : "Image unavailable"}
      data-lesson-image-fallback=""
      className="my-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 align-middle text-sm text-muted-foreground"
    >
      <ImageOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{alt ? `Image unavailable: ${alt}` : "Image unavailable"}</span>
    </span>
  );
  if (failed) return fallback;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="my-2 block max-w-full cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={alt ? `Open image: ${alt}` : "Open image"}
      >
        <SafeImage
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="block h-auto max-w-full rounded-lg border bg-muted/30"
          fallback={fallback}
          onError={() => setFailed(true)}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto max-w-[95vw] border-0 bg-transparent p-0 shadow-none sm:max-w-[95vw]" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{alt || "Lesson image"}</DialogTitle>
          <figure className="flex flex-col items-center gap-2">
            <img src={src} alt={alt} referrerPolicy="no-referrer" className="max-h-[85vh] max-w-full rounded-lg bg-background object-contain" />
            {alt && <figcaption className="rounded bg-background/90 px-2 py-1 text-sm text-foreground">{alt}</figcaption>}
          </figure>
        </DialogContent>
      </Dialog>
    </>
  );
}

const INLINE = /(!\[[^\]]*\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("![")) {
      const close = tok.indexOf("](");
      const alt = tok.slice(2, close);
      const src = safeImageSrc(tok.slice(close + 2, -1));
      // Unsafe or unsupported source: show the alt text only, never the URL.
      out.push(src ? <LessonImage key={k} src={src} alt={alt} /> : <Fragment key={k}>{alt}</Fragment>);
    } else if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const close = tok.indexOf("](");
      const label = tok.slice(1, close);
      const href = safeHref(tok.slice(close + 2, -1));
      out.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
            {label}
          </a>
        ) : (
          <Fragment key={k}>{label}</Fragment>
        )
      );
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function SafeMarkdown({ source, className }: { source: string; className?: string }) {
  const lines = (source ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let b = 0;

  while (i < lines.length) {
    const line = lines[i];
    const k = `b${b++}`;

    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k} className="overflow-x-auto rounded-lg bg-muted p-3 text-sm"><code>{code.join("\n")}</code></pre>
      );
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "font-serif text-2xl font-semibold" : level === 2 ? "font-serif text-xl font-semibold" : "text-base font-semibold";
      const content = renderInline(h[2], k);
      blocks.push(level === 1 ? <h2 key={k} className={cls}>{content}</h2> : level === 2 ? <h3 key={k} className={cls}>{content}</h3> : <h4 key={k} className={cls}>{content}</h4>);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(
        <ul key={k} className="list-disc space-y-1 pl-6">
          {items.map((t, j) => <li key={j}>{renderInline(t, `${k}-${j}`)}</li>)}
        </ul>
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={k} className="list-decimal space-y-1 pl-6">
          {items.map((t, j) => <li key={j}>{renderInline(t, `${k}-${j}`)}</li>)}
        </ol>
      );
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={k} className="border-l-2 border-gold pl-4 italic text-muted-foreground">
          {renderInline(quote.join(" "), k)}
        </blockquote>
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*([-*]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !lines[i].trim().startsWith("```")
    ) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={k} className="leading-relaxed">
        {para.map((t, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {renderInline(t, `${k}-${j}`)}
          </Fragment>
        ))}
      </p>
    );
  }

  return <div className={cn("space-y-3 text-foreground break-words", className)}>{blocks}</div>;
}
