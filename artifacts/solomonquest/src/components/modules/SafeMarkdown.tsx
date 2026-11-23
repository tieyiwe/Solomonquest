import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A deliberately small markdown renderer for lesson bodies. It builds React
 * elements only (no dangerouslySetInnerHTML), so any HTML a teacher types is
 * shown as literal text. Supports: # / ## / ### headings, - or * bullet
 * lists, 1. numbered lists, > quotes, ``` code blocks, blank-line
 * paragraphs, **bold**, *italic*, `code` and [text](https://link).
 */

function safeHref(url: string): string | null {
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
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
