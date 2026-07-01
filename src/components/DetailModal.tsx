import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X, Play, Plus, Check, Star, Lock, ChevronDown, CheckCircle2 } from "lucide-react";
import { useDetail } from "./DetailContext";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { getDetails, getSeasonEpisodes, type TmdbItem } from "@/lib/tmdb.functions.app";
import { img, year } from "@/lib/tmdb";
import { MovieCard } from "./MovieCard";
import { fetchProgressForTitle, type WatchProgress } from "@/lib/continue-watching";

export function DetailModal() {
  const { current, close } = useDetail();
  const { user, profile, isAdmin } = useAuth();
  const { activeProfile } = useProfile();
  const navigate = useNavigate();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const canWatch = isAdmin || (!!user && profile?.status === "approved");

  // Watch progress for this title (drives the "Continue" button + episode badges)
  const [watchProgress, setWatchProgress] = useState<WatchProgress | null>(null);

  useEffect(() => {
    if (!current || !user || !activeProfile) { setWatchProgress(null); return; }
    fetchProgressForTitle(user.id, activeProfile.id, current.id, current.mediaType).then(setWatchProgress);
  }, [current?.id, current?.mediaType, user?.id, activeProfile?.id]);

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

  // Lock scroll + auto-focus close button when modal opens
  useEffect(() => {
    if (current) {
      document.body.style.overflow = "hidden";
      // Small delay so the modal has rendered before focusing
      const t = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => {
        clearTimeout(t);
        document.body.style.overflow = "";
      };
    }
  }, [current]);

  // Close on Escape (TV Back button)
  useEffect(() => {
    if (!current) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "GoBack") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [current, close]);

  // Focus trap — keep D-pad focus inside the modal
  useEffect(() => {
    if (!current || !modalRef.current) return;
    const modal = modalRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.closest("[disabled]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [current, data]); // re-run when data loads so focusable list is complete

  if (!current) return null;

  // Ratings that are NOT allowed for kids profiles
  const KIDS_BLOCKED_RATINGS = new Set(["R", "NC-17", "TV-MA", "TV-14", "18+", "18", "X"]);

  const isKidsProfile = activeProfile?.is_kids ?? false;
  const isBlockedForKids = isKidsProfile && !!data?.certification && KIDS_BLOCKED_RATINGS.has(data.certification.toUpperCase());

  const handlePlay = (season = 1, episode = 1) => {
    if (isBlockedForKids) return;
    close();
    if (!canWatch) { navigate("/"); return; }
    const poster = data?.poster_path ?? "";
    const backdrop = data?.backdrop_path ?? "";
    const title = data?.title ?? current.title ?? "";
    navigate(`/watch/${current.mediaType}/${current.id}?title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&backdrop=${encodeURIComponent(backdrop)}&season=${season}&episode=${episode}&startOver=1`);
  };

  const isTv = current.mediaType === "tv";
  const totalSeasons = data?.number_of_seasons ?? 1;

  // Shared focus-visible style for all interactive elements inside the modal
  const focusStyle = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-card";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 py-10 backdrop-blur-sm"
      onClick={close}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          onClick={close}
          className={`absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 transition hover:bg-black/80 ${focusStyle}`}
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
              ) : watchProgress && watchProgress.watched_seconds >= 5 ? (
                // Has in-progress watch — show "Continue" + separate "Play from Start"
                <>
                  <button
                    onClick={() => {
                      if (isBlockedForKids) return;
                      close();
                      if (!canWatch) { navigate("/"); return; }
                      const poster = data?.poster_path ?? "";
                      const backdrop = data?.backdrop_path ?? "";
                      const title = data?.title ?? current.title ?? "";
                      const s = watchProgress.season ?? 1;
                      const ep = watchProgress.episode ?? 1;
                      navigate(`/watch/${current.mediaType}/${current.id}?title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&backdrop=${encodeURIComponent(backdrop)}&season=${s}&episode=${ep}`);
                    }}
                    className={`flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/85 ${focusStyle}`}
                  >
                    {canWatch ? <Play className="h-5 w-5 fill-current" /> : <Lock className="h-5 w-5" />}
                    {canWatch
                      ? isTv
                        ? `Continue S${watchProgress.season} E${watchProgress.episode}`
                        : "Continue"
                      : "Unlock"}
                  </button>
                  {canWatch && (
                    <button
                      onClick={() => handlePlay(isTv ? 1 : 1, 1)}
                      className={`flex items-center gap-2 rounded-md border border-border bg-secondary px-5 py-2.5 font-semibold transition hover:bg-accent ${focusStyle}`}
                    >
                      <Play className="h-4 w-4" />
                      Play from Start
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => handlePlay(isTv ? selectedSeason : 1, 1)}
                  className={`flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/85 ${focusStyle}`}
                >
                  {canWatch ? <Play className="h-5 w-5 fill-current" /> : <Lock className="h-5 w-5" />}
                  {canWatch ? "Play" : "Unlock"}
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
                        className={`flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-semibold transition hover:bg-accent ${focusStyle}`}
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
                              className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-accent ${s === selectedSeason ? "font-bold text-primary" : ""} ${focusStyle}`}
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
                    {(episodes ?? []).map((ep: { episode_number: number; name: string; overview?: string; still_path?: string | null; runtime?: number | null }) => {
                      // Determine episode watch state for badge display
                      const isCurrent =
                        watchProgress &&
                        watchProgress.season === selectedSeason &&
                        watchProgress.episode === ep.episode_number;
                      const isWatched =
                        watchProgress &&
                        watchProgress.season === selectedSeason &&
                        watchProgress.episode != null &&
                        ep.episode_number < watchProgress.episode;
                      const progressPct =
                        isCurrent && watchProgress!.duration_seconds > 0
                          ? Math.min(100, (watchProgress!.watched_seconds / watchProgress!.duration_seconds) * 100)
                          : 0;

                      return (
                      <button
                        key={ep.episode_number}
                        onClick={() => { if (!isBlockedForKids) handlePlay(selectedSeason, ep.episode_number); }}
                        onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
                        disabled={isBlockedForKids}
                        className={`flex w-full items-start gap-3 rounded-lg p-2 text-left transition hover:bg-accent active:bg-accent/80 ${isBlockedForKids ? "opacity-40 cursor-not-allowed" : ""} ${focusStyle}`}
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
                          {/* Watched overlay */}
                          {isWatched && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                              <CheckCircle2 className="h-7 w-7 text-primary drop-shadow" />
                            </div>
                          )}
                          {/* Continue badge */}
                          {isCurrent && (
                            <div className="absolute inset-x-0 bottom-0">
                              <div className="h-1 bg-muted/50">
                                <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
                              </div>
                            </div>
                          )}
                          {/* Play hover overlay */}
                          {!isWatched && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/40">
                              <Play className="h-5 w-5 fill-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                            </div>
                          )}
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
                          {isCurrent && (
                            <p className="mt-1 text-xs font-semibold text-primary">Continue watching</p>
                          )}
                          {isWatched && (
                            <p className="mt-1 text-xs text-muted-foreground">Watched</p>
                          )}
                        </div>
                      </button>
                      );
                    })}
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
