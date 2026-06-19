import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Play, Plus, Check, Star, Lock, ChevronDown } from "lucide-react";
import { useDetail } from "./DetailContext";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { getDetails, getSeasonEpisodes, type TmdbItem } from "@/lib/tmdb.functions.app";
import { addToList, removeFromList, fetchMyList } from "@/lib/mylist";
import { img, year } from "@/lib/tmdb";
import { MovieCard } from "./MovieCard";

export function DetailModal() {
  const { current, close } = useDetail();
  const { user, profile, isAdmin } = useAuth();
  const { activeProfile } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [inList, setInList] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);

  const canWatch = isAdmin || (!!user && profile?.status === "approved");

  const { data, isLoading } = useQuery({
    queryKey: ["details", current?.mediaType, current?.id],
    queryFn: () => getDetails({ data: { id: current!.id, mediaType: current!.mediaType } }),
    enabled: !!current,
  });

  // Reset season when modal opens
  useEffect(() => {
    if (current) setSelectedSeason(1);
  }, [current?.id]);

  const { data: episodes, isLoading: episodesLoading } = useQuery({
    queryKey: ["episodes", current?.id, selectedSeason],
    queryFn: () => getSeasonEpisodes({ data: { id: current!.id, season: selectedSeason } }),
    enabled: !!current && current.mediaType === "tv",
  });

  useEffect(() => {
    if (!current || !user || !activeProfile) { setInList(false); return; }
    // Use cached my-list data if available, otherwise fetch
    const cached = queryClient.getQueryData<import("@/lib/mylist").ListItem[]>(["my-list", user.id, activeProfile.id]);
    if (cached) {
      setInList(cached.some((l) => l.tmdb_id === current.id && l.media_type === current.mediaType));
    } else {
      fetchMyList(user.id, activeProfile.id).then((list) => {
        queryClient.setQueryData(["my-list", user.id, activeProfile.id], list);
        setInList(list.some((l) => l.tmdb_id === current.id && l.media_type === current.mediaType));
      });
    }
  }, [current, user, activeProfile]);

  useEffect(() => {
    if (current) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [current]);

  if (!current) return null;

  const toggleList = async () => {
    if (!user || !data || !activeProfile) { navigate("/auth"); return; }
    if (inList) {
      await removeFromList(user.id, activeProfile.id, current.id, current.mediaType);
      setInList(false);
    } else {
      await addToList({ user_id: user.id, profile_id: activeProfile.id, tmdb_id: current.id, media_type: current.mediaType, title: data.title, poster_path: data.poster_path, vote_average: data.vote_average ?? null });
      setInList(true);
    }
    queryClient.invalidateQueries({ queryKey: ["my-list", user.id, activeProfile.id] });
  };

  // Ratings that are NOT allowed for kids profiles
  const KIDS_BLOCKED_RATINGS = new Set(["R", "NC-17", "TV-MA", "TV-14", "18+", "18", "X"]);

  const isKidsProfile = activeProfile?.is_kids ?? false;
  const isBlockedForKids = isKidsProfile && !!data?.certification && KIDS_BLOCKED_RATINGS.has(data.certification.toUpperCase());

  const handlePlay = (season = 1, episode = 1) => {
    if (isBlockedForKids) return; // safety — button is hidden but guard here too
    close();
    if (!canWatch) { navigate("/"); return; }
    const poster = data?.poster_path ?? current.poster_path ?? "";
    const backdrop = data?.backdrop_path ?? current.backdrop_path ?? "";
    const title = data?.title ?? current.title ?? "";
    navigate(`/watch/${current.mediaType}/${current.id}?title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&backdrop=${encodeURIComponent(backdrop)}&season=${season}&episode=${episode}&startOver=1`);
  };

  const isTv = current.mediaType === "tv";
  const totalSeasons = data?.number_of_seasons ?? 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 py-10 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 transition hover:bg-black/80"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Backdrop / trailer */}
        <div className="relative aspect-video w-full bg-muted">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
          ) : data?.trailerKey ? (
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${data.trailerKey}?rel=0`}
              title="Trailer"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <img src={img(data?.backdrop_path, "w780")} alt={data?.title} className="h-full w-full object-cover" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        </div>

        {data && (
          <div className="space-y-4 p-5 sm:p-7">
            <h2 className="text-2xl font-extrabold sm:text-3xl">{data.title}</h2>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 text-primary">
                <Star className="h-4 w-4 fill-primary" /> {data.vote_average.toFixed(1)}
              </span>
              <span>{year(data.release_date)}</span>
              {data.runtime ? <span>{data.runtime} min</span> : null}
              {data.number_of_seasons ? <span>{data.number_of_seasons} seasons</span> : null}
              {data.certification ? (
                <span className="rounded border border-border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                  {data.certification}
                </span>
              ) : null}
            </div>

            {isBlockedForKids && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/15 px-3 py-2 text-sm font-semibold text-destructive">
                <Lock className="h-4 w-4 shrink-0" />
                This title is rated <span className="mx-1 font-bold">{data.certification}</span> and is not available on Kids profiles.
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {isBlockedForKids ? (
                <div className="flex items-center gap-2 rounded-md bg-muted px-6 py-2.5 font-semibold text-muted-foreground cursor-not-allowed select-none">
                  <Lock className="h-5 w-5" />
                  Not for Kids
                </div>
              ) : (
                <button
                  onClick={() => handlePlay(isTv ? selectedSeason : 1, 1)}
                  className="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/85"
                >
                  {canWatch ? <Play className="h-5 w-5 fill-current" /> : <Lock className="h-5 w-5" />}
                  {canWatch ? "Play" : "Unlock"}
                </button>
              )}
              {!isBlockedForKids && (
                <button
                  onClick={toggleList}
                  className="flex items-center gap-2 rounded-md bg-secondary px-5 py-2.5 font-semibold transition hover:bg-accent"
                >
                  {inList ? <Check className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5" />}
                  {inList ? "In My List" : "My List"}
                </button>
              )}
            </div>

            <p className="text-sm leading-relaxed text-foreground/85">{data.overview}</p>
            {data.genres.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground">Genres: </span>{data.genres.join(", ")}
              </p>
            )}
            {data.cast.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground">Cast: </span>{data.cast.join(", ")}
              </p>
            )}

            {/* ── Episode picker (TV only) ── */}
            {isTv && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">Episodes</h3>

                  {/* Season dropdown */}
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

                {/* Episode grid */}
                {episodesLoading ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">Loading episodes…</div>
                ) : (
                  <div className="space-y-2">
                    {(episodes ?? []).map((ep) => (
                      <button
                        key={ep.episode_number}
                        onClick={() => { if (!isBlockedForKids) handlePlay(selectedSeason, ep.episode_number); }}
                        disabled={isBlockedForKids}
                        className={`flex w-full items-start gap-3 rounded-lg p-2 text-left transition hover:bg-accent active:bg-accent/80 ${isBlockedForKids ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {/* Thumbnail */}
                        <div className="relative w-28 shrink-0 overflow-hidden rounded-md bg-muted sm:w-36">
                          <div className="aspect-video w-full">
                            {ep.still_path ? (
                              <img
                                src={img(ep.still_path, "w300")}
                                alt={ep.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-muted">
                                <Play className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          {/* Play icon overlay */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/40">
                            <Play className="h-5 w-5 fill-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                          </div>
                        </div>

                        {/* Episode info */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-xs font-bold text-primary">E{ep.episode_number}</p>
                          <p className="line-clamp-1 text-sm font-semibold">{ep.name}</p>
                          {ep.runtime && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{ep.runtime} min</p>
                          )}
                          {ep.overview && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ep.overview}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* More Like This */}
            {data.similar.length > 0 && (
              <div>
                <h3 className="mb-3 text-lg font-bold">More Like This</h3>
                <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
                  {data.similar.slice(0, 10).map((s: TmdbItem) => (
                    <MovieCard key={`${s.media_type}-${s.id}`} item={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
