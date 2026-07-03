import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { fetchContinueWatching, removeProgress, type WatchProgress } from "@/lib/continue-watching";
import { img } from "@/lib/tmdb";
import { ResumeModal } from "./ResumeModal";
import { navigateVertical } from "@/lib/tv-navigation";

// Ratings that should not appear in a kids profile's Continue Watching row
const KIDS_BLOCKED_RATINGS = new Set(["PG-13", "R", "NC-17", "TV-14", "TV-MA", "18+", "18", "X"]);

export function ContinueWatchingRow() {
  const { user, profile, isAdmin } = useAuth();
  const { activeProfile, profiles } = useProfile();
  const [items, setItems] = useState<WatchProgress[]>([]);
  const [prompt, setPrompt] = useState<WatchProgress | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const canWatch = isAdmin || profile?.status === "approved";
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
    if (prompt?.tmdb_id === item.tmdb_id) setPrompt(null);
  };

  const playUrl = (item: WatchProgress, s: number, ep: number) =>
    `/watch/${item.media_type}/${item.tmdb_id}?title=${encodeURIComponent(item.title)}&poster=${encodeURIComponent(item.poster_path ?? "")}&backdrop=${encodeURIComponent(item.backdrop_path ?? "")}&season=${s}&episode=${ep}`;

  const handleContinue = (item: WatchProgress) => {
    setPrompt(null);
    navigate(playUrl(item, item.season ?? 1, item.episode ?? 1));
  };

  const handlePlayEpisode = (item: WatchProgress, season: number, episode: number) => {
    setPrompt(null);
    navigate(playUrl(item, season, episode));
  };
  return (
    <>
      <section className="group/row relative mb-8">
        <h2 className="mb-3 px-4 text-lg font-bold sm:px-8 md:text-xl">Continue Watching</h2>

        <button onClick={() => scroll(-1)} className="absolute left-0 top-1/2 z-10 hidden h-32 -translate-y-1/2 items-center bg-gradient-to-r from-background/90 to-transparent px-2 opacity-0 transition-opacity group-hover/row:opacity-100 md:flex" aria-label="Scroll left">
          <ChevronLeft className="h-8 w-8" />
        </button>

        <div ref={rowRef} className="row-scroll flex gap-3 overflow-x-auto px-4 pb-2 sm:px-8">
          {items.map((item) => {
            const poster = img(item.poster_path ?? item.backdrop_path, "w500");

            return (
              <div
                key={`${item.media_type}-${item.tmdb_id}`}
                className="relative w-[150px] shrink-0 sm:w-[180px]"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <button
                  onClick={() => setPrompt(item)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); navigateVertical(e.currentTarget, "down"); }
                    if (e.key === "ArrowUp")   { e.preventDefault(); navigateVertical(e.currentTarget, "up"); }
                  }}
                  data-tv-card
                  className="block w-full cursor-pointer text-left overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:scale-105 transition-transform duration-200"
                  aria-label={`Play ${item.title}`}
                >
                  <div className="aspect-[2/3] w-full overflow-hidden rounded-md bg-muted">
                    {poster
                      ? <img src={poster} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">{item.title}</div>
                    }
                  </div>
                </button>

                <div className="mt-1.5 px-0.5">
                  <p className="line-clamp-1 text-xs font-semibold text-foreground leading-tight">{item.title}</p>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(item); }}
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

        <button onClick={() => scroll(1)} className="absolute right-0 top-1/2 z-10 hidden h-32 -translate-y-1/2 items-center bg-gradient-to-l from-background/90 to-transparent px-2 opacity-0 transition-opacity group-hover/row:opacity-100 md:flex" aria-label="Scroll right">
          <ChevronRight className="h-8 w-8" />
        </button>
      </section>

      {/* Continue / Start Over prompt — same card style as DetailModal */}
      <ResumeModal
        item={prompt}
        onContinue={handleContinue}
        onPlayEpisode={handlePlayEpisode}
        onClose={() => setPrompt(null)}
      />
    </>
  );
}
