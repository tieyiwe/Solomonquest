import { memo, type ReactNode } from "react";

// http(s):// URLs, or bare www. hosts. Trailing punctuation that is almost
// always sentence punctuation is trimmed off the link below.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}'"»”’]+$/;

function safeHref(raw: string): string | null {
  const withScheme = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Renders message text with links made clickable. Everything is emitted as
 * React text nodes / <a> elements — never as HTML — so message content can't
 * inject markup, and only http(s) URLs become links.
 */
export const RichText = memo(function RichText({
  text,
  linkClassName = "underline underline-offset-2 decoration-current/40 hover:decoration-current break-all",
}: {
  text: string;
  linkClassName?: string;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let url = match[0];
    const trail = TRAILING.exec(url)?.[0] ?? "";
    // Keep a closing paren that balances an opening one inside the URL.
    if (trail.startsWith(")") && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)) {
      url = url.slice(0, url.length - trail.length + 1);
    } else if (trail) {
      url = url.slice(0, url.length - trail.length);
    }
    const href = safeHref(url);
    if (!href) continue;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a key={start} href={href} target="_blank" rel="noopener noreferrer nofollow" className={linkClassName}>
        {url}
      </a>
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
});
