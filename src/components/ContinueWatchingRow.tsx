import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Play, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { fetchContinueWatching, removeProgress, type WatchProgress } from "@/lib/continue-watching";
import { img } from "@/lib/tmdb";

export function ContinueWatchingRow() {
  const { user, profile, isAdmin } = useAuth();
  const { activeProfile, profiles } = useProfile();
  const [items, setItems] = useState<WatchProgress[]>([]);
  const rowRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const canWatch = isAdmin || profile?.status === "approved";
  const effectiveProfile = activeProfile ?? profiles.find((p) => p.is_default) ?? profiles[0] ?? null;

  const load = useCallback(() => {
    if (!user || !canWatch || !effectiveProfile) return;
    fetchContinueWatching(user.id, effectiveProfile.id).then(setItems);
  }, [user, canWatch, effectiveProfile]);

  // Fetch on mount and whenever user/profile changes
  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch when the tab becomes visible again (user returns from watch page)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  if (!items.length) return null;

  const scroll = (dir: 1 | -1) => {
    rowRef.current?.scrollBy({ left: dir * (rowRef.current.clientWidth * 0.8), behavior: "smooth" });
  };

  const handleRemove = async (item: WatchProgress) => {
    if (!user || !effectiveProfile) return;
    await removeProgress(user.id, effectiveProfile.id, item.tmdb_id, item.media_type);
    setItems((prev) => prev.filter((i) => i.tmdb_id !== item.tmdb_id || i.media_type !== item.media_type));
  };

  const handlePlay = (item: WatchProgress) => {
    navigate(`/watch/${item.media_type}/${item.tmdb_id}?title=${encodeURIComponent(item.title)}&poster=${encodeURIComponent(item.poster_path ?? "")}&backdrop=${encodeURIComponent(item.backdrop_path ?? "")}&season=${item.season ?? 1}&episode=${item.episode ?? 1}`);
  };

  return (
    <section className="group/row relative mb-8">
      <h2 className="mb-3 px-4 text-lg font-bold sm:px-8 md:text-xl">Continue Watching</h2>

      <button onClick={() => scroll(-1)} className="absolute left-0 top-1/2 z-10 hidden h-32 -translate-y-1/2 items-center bg-gradient-to-r from-background/90 to-transparent px-2 opacity-0 transition-opacity group-hover/row:opacity-100 md:flex" aria-label="Scroll left">
        <ChevronLeft className="h-8 w-8" />
      </button>

      <div ref={rowRef} className="row-scroll flex gap-3 overflow-x-auto px-4 pb-2 sm:px-8">
        {items.map((item) => {
          const pct = item.duration_seconds > 0 ? Math.min(100, Math.round((item.watched_seconds / item.duration_seconds) * 100)) : 0;
          const poster = img(item.poster_path ?? item.backdrop_path, "w500");
        // If duration is unknown, show a small minimum bar so it's always visible
          const barWidth = item.duration_seconds > 0 ? pct : item.watched_seconds > 0 ? 5 : 0;
          return (
            <div
              key={`${item.media_type}-${item.tmdb_id}`}
              className="group relative w-[150px] shrink-0 overflow-hidden rounded-md bg-card sm:w-[180px]"
            >
              {/* Whole card is tappable — fires immediately on Android */}
              <button
                onClick={() => handlePlay(item)}
                className="block w-full cursor-pointer text-left"
                aria-label={`Play ${item.title}`}
              >
                <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
                  {poster ? <img src={poster} alt={item.title} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">{item.title}</div>}
                </div>
              </button>

              {/* Progress bar — sits at bottom of card, always visible, Netflix style */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div
                  className="h-full bg-red-600 transition-all"
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              {/* Hover overlay — desktop only, tap handled by card button above */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Play className="h-5 w-5 fill-current" />
                </div>
                <p className="line-clamp-2 px-2 text-center text-xs font-semibold">
                  {item.title}{item.media_type === "tv" && item.season != null ? ` S${item.season}E${item.episode}` : ""}
                </p>
                {pct > 0 && <span className="text-xs text-foreground/70">{pct}% watched</span>}
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); handleRemove(item); }}
                className="absolute right-1 top-1 z-10 hidden rounded-full bg-black/70 p-1 group-hover:block hover:bg-black"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <button onClick={() => scroll(1)} className="absolute right-0 top-1/2 z-10 hidden h-32 -translate-y-1/2 items-center bg-gradient-to-l from-background/90 to-transparent px-2 opacity-0 transition-opacity group-hover/row:opacity-100 md:flex" aria-label="Scroll right">
        <ChevronRight className="h-8 w-8" />
      </button>
    </section>
  );
}
