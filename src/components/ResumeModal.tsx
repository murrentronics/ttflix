import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Play, ChevronDown } from "lucide-react";
import { img } from "@/lib/tmdb";
import { getSeasonEpisodes, getDetails } from "@/lib/tmdb.functions.app";
import type { WatchProgress } from "@/lib/continue-watching";

type Props = {
  item: WatchProgress | null;
  onContinue: (item: WatchProgress) => void;
  onStartOver: (item: WatchProgress) => void;
  onPlayEpisode: (item: WatchProgress, season: number, episode: number) => void;
  onClose: () => void;
};

export function ResumeModal({ item, onContinue, onPlayEpisode, onClose }: Props) {
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);

  useEffect(() => {
    if (item) setSelectedSeason(item.season ?? 1);
  }, [item?.tmdb_id]);

  useEffect(() => {
    if (item) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [item]);

  const isTv = item?.media_type === "tv";

  const { data: details } = useQuery({
    queryKey: ["details", "tv", item?.tmdb_id],
    queryFn: () => getDetails({ data: { id: item!.tmdb_id, mediaType: "tv" } }),
    enabled: !!item && isTv,
  });

  const { data: episodes, isLoading: episodesLoading } = useQuery({
    queryKey: ["episodes", item?.tmdb_id, selectedSeason],
    queryFn: () => getSeasonEpisodes({ data: { id: item!.tmdb_id, season: selectedSeason } }),
    enabled: !!item && isTv,
  });

  if (!item) return null;

  const backdrop = img(item.backdrop_path ?? item.poster_path, "w780");
  const poster   = img(item.poster_path ?? item.backdrop_path, "w500");

  const progress =
    item.duration_seconds > 0
      ? Math.min(Math.round((item.watched_seconds / item.duration_seconds) * 100), 99)
      : null;

  const totalSeasons = details?.number_of_seasons ?? 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      style={{ paddingTop: "72px" }}
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
          {progress !== null && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        <div className="space-y-4 p-5">
          <h2 className="text-xl font-extrabold">{item.title}</h2>

          {/* Continue button only */}
          <button
            onClick={() => onContinue(item)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary/85"
          >
            <Play className="h-5 w-5 fill-current" />
            {item.media_type === "tv" && item.season != null
              ? `Continue — S${item.season} E${item.episode}`
              : "Continue Watching"}
          </button>

          {/* Episode picker — TV only */}
          {isTv && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Episodes</h3>

                {totalSeasons > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowSeasonPicker((v) => !v)}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-semibold transition hover:bg-accent"
                    >
                      Season {selectedSeason}
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    {showSeasonPicker && (
                      <div className="absolute right-0 top-full z-20 mt-1 max-h-56 w-36 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                        {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((s) => (
                          <button
                            key={s}
                            onClick={() => { setSelectedSeason(s); setShowSeasonPicker(false); }}
                            className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-accent ${s === selectedSeason ? "font-bold text-primary" : ""}`}
                          >
                            Season {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {episodesLoading ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Loading episodes…</div>
              ) : (
                <div className="space-y-2">
                  {(episodes ?? []).map((ep) => (
                    <button
                      key={ep.episode_number}
                      onClick={() => onPlayEpisode(item, selectedSeason, ep.episode_number)}
                      className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition hover:bg-accent active:bg-accent/80"
                    >
                      <div className="relative w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                        <div className="aspect-video w-full">
                          {ep.still_path ? (
                            <img src={img(ep.still_path, "w300")} alt={ep.name} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-muted">
                              <Play className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-xs font-bold text-primary">E{ep.episode_number}</p>
                        <p className="line-clamp-1 text-sm font-semibold">{ep.name}</p>
                        {ep.runtime && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{ep.runtime} min</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
