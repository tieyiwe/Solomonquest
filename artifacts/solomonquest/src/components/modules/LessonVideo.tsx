import { RequiredVideoPlayer } from "@/components/video/RequiredVideoPlayer";

export type ParsedVideo =
  | { kind: "youtube"; embedUrl: string }
  | { kind: "vimeo"; embedUrl: string }
  | { kind: "file"; src: string }
  | null;

/** YouTube / Vimeo links become privacy-friendly embeds; anything else is
 *  treated as a direct video file. Only http(s) URLs are accepted. */
export function parseVideoUrl(raw: string | null | undefined): ParsedVideo {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") yt = u.searchParams.get("v");
    else {
      const m = /^\/(embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
      if (m) yt = m[2];
    }
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) return { kind: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?rel=0` };
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = /(\d{6,12})/.exec(u.pathname);
    if (m) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${m[1]}` };
  }
  return { kind: "file", src: u.toString() };
}

/**
 * Plays a lesson's video. A direct video file with "require full watch"
 * uses the existing RequiredVideoPlayer (no skipping ahead) and calls
 * onWatched when it ends, which the reader turns into an auto-complete.
 */
export function LessonVideo({
  url,
  requireWatch,
  onWatched,
}: {
  url: string;
  requireWatch: boolean;
  onWatched?: () => void;
}) {
  const v = parseVideoUrl(url);
  if (!v) return null;
  if (v.kind === "youtube" || v.kind === "vimeo") {
    return (
      <div className="relative w-full overflow-hidden rounded-xl bg-black aspect-video">
        <iframe
          src={v.embedUrl}
          title="Lesson video"
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  if (requireWatch) return <RequiredVideoPlayer src={v.src} onComplete={onWatched} />;
  return (
    <video src={v.src} controls playsInline className="w-full rounded-xl bg-black aspect-video" onEnded={onWatched} />
  );
}
