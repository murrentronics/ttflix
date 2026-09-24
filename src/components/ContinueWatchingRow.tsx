import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { fetchContinueWatching, removeProgress, resetProgress, type WatchProgress } from "@/lib/continue-watching";
import { img, year } from "@/lib/tmdb";
import { getDetails } from "@/lib/tmdb.functions.app";
import { ResumeModal } from "./ResumeModal";
import { progressPercent } from "@/lib/next-episode";
import { subscriberCanWatch } from "@/lib/admin";

// Ratings that should not appear in a kids profile's Continue Watching row
const KIDS_BLOCKED_RATINGS = new Set(["PG-13", "R", "NC-17", "TV-14", "TV-MA", "18+", "18", "X"]);

export function ContinueWatchingRow() {
  const { user, profile, isAdmin } = useAuth();
  const { activeProfile, profiles } = useProfile();
  const [items, setItems] = useState<WatchProgress[]>([]);
  const [prompt, setPrompt] = useState<WatchProgress | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const canWatch = subscriberCanWatch(profile?.status, profile?.subscription_expires_at, profile?.role, isAdmin);
  const effectiveProfile = activeProfile ?? profiles.find((p) => p.is_default) ?? profiles[0] ?? null;
  const isKidsProfile = activeProfile?.is_kids ?? false;

  const load = useCallback(() => {
    if (!user || !canWatch || !effectiveProfile) return;
    fetchContinueWatching(user.id, effectiveProfile.id).then((fetched) => {
      if (isKidsProfile) {
        setItems(fetched.filter((item) => {
          const cert = (item as any).certification?.toUpperCase() ?? null;
          return !cert || !KIDS_BLOCKED_RATINGS.has(cert);
        }));
      } else {
        setItems(fetched);
      }
    });
  }, [user, canWatch, effectiveProfile, isKidsProfile]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    const onFocus = () => load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [load]);

  const yearQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ["details", item.media_type, item.tmdb_id],
      queryFn: () => getDetails({ data: { id: item.tmdb_id, mediaType: item.media_type } }),
      staleTime: 60 * 60 * 1000,
    })),
  });

  if (!items.length) return null;

  const scroll = (dir: 1 | -1) => {
    rowRef.current?.scrollBy({ left: dir * (rowRef.current.clientWidth * 0.8), behavior: "smooth" });
  };

  const handleRemove = async (item: WatchProgress) => {
    if (!user || !effectiveProfile) return;
    await removeProgress(user.id, effectiveProfile.id, item.tmdb_id, item.media_type);
    setItems((prev) => prev.filter((i) => i.tmdb_id !== item.tmdb_id || i.media_type !== item.media_type));
    if (prompt?.tmdb_id === item.tmdb_id) setPrompt(null);
  };

  const playUrl = (item: WatchProgress, s: number, ep: number, progress?: number) => {
    const base = `/watch/${item.media_type}/${item.tmdb_id}?title=${encodeURIComponent(item.title)}&poster=${encodeURIComponent(item.poster_path ?? "")}&backdrop=${encodeURIComponent(item.backdrop_path ?? "")}&season=${s}&episode=${ep}`;
    return progress !== undefined ? `${base}&progress=${Math.max(0, Math.floor(progress))}` : base;
  };

  const handleContinue = (item: WatchProgress) => {
    setPrompt(null);
    const resumeAt = item.duration_seconds > 0 && item.watched_seconds / item.duration_seconds >= 0.92
      ? 0
      : item.watched_seconds;
    navigate(playUrl(item, item.season ?? 1, item.episode ?? 1, resumeAt));
  };

  const handleStartOver = async (item: WatchProgress) => {
    setPrompt(null);
    if (user && effectiveProfile) {
      await resetProgress(user.id, effectiveProfile.id, item.tmdb_id, item.media_type);
    }
    navigate(`${playUrl(item, 1, 1, 0)}&startOver=1`);
  };

  const handlePlayEpisode = (item: WatchProgress, season: number, episode: number) => {
    setPrompt(null);
    const sameSpot = item.season === season && item.episode === episode;
    navigate(playUrl(item, season, episode, sameSpot ? item.watched_seconds : 0));
  };
  return (
    <>
      <section className="group/row relative mb-2 overflow-visible">
        <h2 className="mb-0 px-4 text-lg font-bold sm:px-8 md:text-xl">Continue Watching</h2>

        <button data-tv-ignore tabIndex={-1} onClick={() => scroll(-1)} className="absolute left-0 top-1/2 z-10 hidden h-32 -translate-y-1/2 items-center bg-gradient-to-r from-background/90 to-transparent px-2 opacity-0 transition-opacity group-hover/row:opacity-100 md:flex" aria-label="Scroll left">
          <ChevronLeft className="h-8 w-8" />
        </button>

        <div ref={rowRef} className="row-scroll flex gap-3 overflow-x-auto px-4 pt-7 pb-8 sm:px-8">
          {items.map((item, i) => {
            const poster = img(item.poster_path ?? item.backdrop_path, "w500");
            const releaseYear = year(yearQueries[i]?.data?.release_date);
            const episodeLabel = item.media_type === "tv" && item.season != null && item.episode != null
              ? `S${item.season} E${item.episode}`
              : null;
            const meta = [releaseYear, episodeLabel].filter(Boolean).join(" · ");

            return (
              <div
                data-tv-cw
                key={`${item.media_type}-${item.tmdb_id}`}
                className="relative z-0 w-[150px] shrink-0 md:hover:z-30 focus-within:z-30 sm:w-[180px]"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <button
                  onClick={() => setPrompt(item)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
                  data-tv-card
                  className="block w-full cursor-pointer rounded-md text-left transition-transform duration-200
                    md:hover:z-30 md:hover:scale-105
                    focus-visible:z-30 focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Play ${item.title}`}
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-muted">
                    {poster
                      ? <img src={poster} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">{item.title}</div>
                    }
                    {(() => {
                      const pct = progressPercent(item.watched_seconds, item.duration_seconds);
                      if (pct == null) return null;
                      return (
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      );
                    })()}
                  </div>
                </button>

                <div className="mt-1.5 px-0.5">
                  <p className="line-clamp-1 text-xs font-semibold leading-tight text-foreground">{item.title}</p>
                  {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
                </div>

                <button
                  data-tv-remove
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleRemove(item); }}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
                  className="absolute right-0 top-0 z-10 flex items-center justify-center bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Remove"
                  style={{ width: 32, height: 32, borderBottomLeftRadius: 8, WebkitTapHighlightColor: "transparent" }}
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            );
          })}
        </div>

        <button data-tv-ignore tabIndex={-1} onClick={() => scroll(1)} className="absolute right-0 top-1/2 z-10 hidden h-32 -translate-y-1/2 items-center bg-gradient-to-l from-background/90 to-transparent px-2 opacity-0 transition-opacity group-hover/row:opacity-100 md:flex" aria-label="Scroll right">
          <ChevronRight className="h-8 w-8" />
        </button>
      </section>

      {/* Continue / Start Over prompt — same card style as DetailModal */}
      <ResumeModal
        item={prompt}
        onContinue={handleContinue}
        onStartOver={handleStartOver}
        onPlayEpisode={handlePlayEpisode}
        onClose={() => setPrompt(null)}
      />
    </>
  );
}
