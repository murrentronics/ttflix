import { useEffect } from "react";
import { X, Play, RotateCcw } from "lucide-react";
import { img } from "@/lib/tmdb";
import type { WatchProgress } from "@/lib/continue-watching";

type Props = {
  item: WatchProgress | null;
  onContinue: (item: WatchProgress) => void;
  onStartOver: (item: WatchProgress) => void;
  onClose: () => void;
};

export function ResumeModal({ item, onContinue, onStartOver, onClose }: Props) {
  useEffect(() => {
    if (item) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [item]);

  if (!item) return null;

  const backdrop = img(item.backdrop_path ?? item.poster_path, "w780");
  const poster   = img(item.poster_path ?? item.backdrop_path, "w500");

  const progress =
    item.duration_seconds > 0
      ? Math.min(Math.round((item.watched_seconds / item.duration_seconds) * 100), 99)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 transition hover:bg-black/80"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Backdrop image */}
        <div className="relative aspect-video w-full bg-muted">
          {backdrop
            ? <img src={backdrop} alt={item.title} className="h-full w-full object-cover" />
            : poster
              ? <img src={poster} alt={item.title} className="h-full w-full object-cover object-top" />
              : <div className="flex h-full items-center justify-center text-muted-foreground text-sm">{item.title}</div>
          }
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card to-transparent" />

          {/* Progress bar */}
          {progress !== null && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        <div className="space-y-4 p-5">
          <div>
            <h2 className="text-xl font-extrabold">{item.title}</h2>
            {item.media_type === "tv" && item.season != null && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Season {item.season} · Episode {item.episode}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => onContinue(item)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary/85"
            >
              <Play className="h-5 w-5 fill-current" />
              Continue Watching
            </button>

            <button
              onClick={() => onStartOver(item)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-secondary px-6 py-3 font-semibold transition hover:bg-accent"
            >
              <RotateCcw className="h-5 w-5" />
              Start Over
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

