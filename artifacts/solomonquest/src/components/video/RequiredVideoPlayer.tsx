import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RequiredVideoPlayerProps {
  src: string;
  onComplete?: () => void;
  className?: string;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RequiredVideoPlayer({ src, onComplete, className = "" }: RequiredVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxWatchedRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [seekBlocked, setSeekBlocked] = useState(false);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  // Prevent seeking forward past the max watched position
  const handleSeeking = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime > maxWatchedRef.current + 0.5) {
      v.currentTime = maxWatchedRef.current;
      setSeekBlocked(true);
      setTimeout(() => setSeekBlocked(false), 1200);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime > maxWatchedRef.current) {
      maxWatchedRef.current = v.currentTime;
    }
    setCurrentTime(v.currentTime);
  }, []);

  const handleEnded = useCallback(() => {
    setCompleted(true);
    setPlaying(false);
    onComplete?.();
  }, [onComplete]);

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  const watchedPercent = duration > 0 ? (maxWatchedRef.current / duration) * 100 : 0;
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remaining = duration - currentTime;

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden ${className}`}>
      {/* Completed overlay */}
      {completed && (
        <div className="absolute inset-0 z-10 bg-black/70 flex flex-col items-center justify-center gap-3">
          <CheckCircle2 className="h-16 w-16 text-green-400" />
          <p className="text-white text-lg font-semibold">Video complete!</p>
          <p className="text-white/70 text-sm">You can now proceed to the next step.</p>
        </div>
      )}

      {/* Seek blocked flash */}
      {seekBlocked && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 pointer-events-none">
          <Lock className="h-3.5 w-3.5" />
          You cannot skip ahead
        </div>
      )}

      {/* Video element (no native controls) */}
      <video
        ref={videoRef}
        src={src}
        className="w-full aspect-video bg-black"
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeeking}
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
        onClick={togglePlay}
        playsInline
      />

      {/* Custom controls */}
      <div className="bg-gray-900 px-4 py-3 space-y-2">
        {/* Progress bars */}
        <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden cursor-default">
          {/* Max watched (lighter) */}
          <div
            className="absolute left-0 top-0 h-full bg-primary/40 rounded-full transition-all"
            style={{ width: `${watchedPercent}%` }}
          />
          {/* Current position (brighter) */}
          <div
            className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all"
            style={{ width: `${currentPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:text-white hover:bg-white/10"
              onClick={togglePlay}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:text-white hover:bg-white/10"
              onClick={toggleMute}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <span className="text-white/60 text-xs tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!completed && (
              <div className="flex items-center gap-1.5 text-xs text-white/50">
                <Lock className="h-3 w-3" />
                <span>{formatTime(remaining)} remaining</span>
              </div>
            )}
            {completed && (
              <div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Watched
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
