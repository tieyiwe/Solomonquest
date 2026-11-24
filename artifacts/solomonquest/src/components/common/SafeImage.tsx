import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Rendered instead of the image when there is no src or it fails to load
   *  (initials, an icon, the school name...). Defaults to nothing, so a dead
   *  link never shows the browser's broken-image icon. */
  fallback?: ReactNode;
};

/** An <img> that swaps itself for `fallback` when the URL is empty or broken. */
export function SafeImage({ fallback = null, onError, src, ...props }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      decoding="async"
      {...props}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
    />
  );
}

/** Ask Unsplash for an image no wider than the screen actually needs.
 *  Other hosts are returned unchanged (we can't resize them). */
export function sizedImageUrl(url: string | null | undefined, cssWidth?: number): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.hostname !== "images.unsplash.com") return url;
    const vw = cssWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1280);
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    // Round up to a 200px step so the CDN cache stays warm across devices.
    const want = Math.min(2400, Math.ceil((vw * dpr) / 200) * 200);
    const current = Number(u.searchParams.get("w")) || Infinity;
    if (want < current) u.searchParams.set("w", String(want));
    return u.toString();
  } catch {
    return url;
  }
}
