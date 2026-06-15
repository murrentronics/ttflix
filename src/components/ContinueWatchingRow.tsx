import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { fetchContinueWatching, removeProgress, type WatchProgress } from "@/lib/continue-watching";
import { getDetails, getSeasonEpisodes } from "@/lib/tmdb.functions.app";
import { supabase } from "@/lib/supabase";
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
    fetchContinueWatching(user.id, effectiveProfile.id).then(async (fetched) => {
      // For items missing duration, fetch from TMDB and patch the DB
      const patched = await Promise.all(fetched.map(async (item) => {
        if (item.duration_seconds > 0) return item;
        try {
          const details = await getDetails({
            data: { id: item.tmdb_id, mediaType: item.media_type }
          });
          let runtimeMins = details.runtime;

          // TV shows often have empty episode_run_time — fall back to episode endpoint
          if (!runtimeMins && item.media_type === "tv") {
            try {
              const episodes = await getSeasonEpisodes({
                data: { id: item.tmdb_id, season: item.season ?? 1 }
              });
              const ep = episodes.find((e: { episode_number: number; runtime?: number | null }) =>
                e.episode_number === (item.episode ?? 1)
              );
              runtimeMins = ep?.runtime ?? episodes[0]?.runtime ?? null;
            } catch { /* ignore */ }
          }

          if (runtimeMins && runtimeMins > 0) {
            const duration = runtimeMins * 60;
            // Patch DB so next load is instant
            supabase.from("watch_progress")
              .update({ duration_seconds: duration })
              .eq("user_id", user.id)
              .eq("tmdb_id", item.tmdb_id)
              .eq("media_type", item.media_type);
            return { ...item, duration_seconds: duration };
          }
        } catch { /* ignore */ }
        return item;
      }));
      setItems(patched);
    });
  }, [user, canWatch, effectiveProfile]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch when returning from watch page
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
          const pct = item.duration_seconds > 0
            ? Math.min(96, Math.round((item.watched_seconds / item.duration_seconds) * 100))
            : 0;
          const poster = img(item.poster_path ?? item.backdrop_path, "w500");

          // Human-readable time remaining
          const secsLeft = item.duration_seconds > 0
            ? Math.max(0, item.duration_seconds - item.watched_seconds)
            : null;
          const minsLeft = secsLeft !== null ? Math.round(secsLeft / 60) : null;
          const timeLabel = minsLeft !== null
            ? minsLeft <= 1 ? "< 1 min left" : `${minsLeft} min left`
            : null;

          return (
            <div
              key={`${item.media_type}-${item.tmdb_id}`}
              className="group relative w-[150px] shrink-0 sm:w-[180px]"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* ── Poster + progress bar ── */}
              <button
                onTouchStart={() => handlePlay(item)}
                onClick={() => handlePlay(item)}
                className="block w-full cursor-pointer text-left overflow-hidden rounded-md"
                aria-label={`Play ${item.title}`}
              >
                <div className="aspect-[2/3] w-full overflow-hidden rounded-md bg-muted">
                  {poster
                    ? <img src={poster} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">{item.title}</div>
                  }
                </div>

                {/* Progress bar — sits flush under the poster */}
                <div className="h-1 w-full bg-white/20 rounded-b-sm">
                  <div
                    className="h-full bg-red-600 rounded-b-sm transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>

              {/* ── Details below the card ── */}
              <div className="mt-1.5 px-0.5">
                {/* Title */}
                <p className="line-clamp-1 text-xs font-semibold text-foreground leading-tight">
                  {item.title}
                </p>

                {/* Episode label for TV */}
                {item.media_type === "tv" && item.season != null && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    S{item.season} · E{item.episode}
                  </p>
                )}

                {/* Movie or TV time remaining */}
                {timeLabel && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {timeLabel}
                  </p>
                )}

                {/* Progress percentage when no duration */}
                {!timeLabel && pct > 0 && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {pct}% watched
                  </p>
                )}
              </div>

              {/* ── Remove button ── */}
              <button
                onTouchStart={(e) => { e.stopPropagation(); handleRemove(item); }}
                onClick={(e) => { e.stopPropagation(); handleRemove(item); }}
                className="absolute right-1 top-1 z-10 rounded-full bg-black/70 p-1.5"
                aria-label="Remove"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <X className="h-3 w-3" />
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
