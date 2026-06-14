import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { streamUrl } from "@/lib/stream";
import { saveProgress } from "@/lib/continue-watching";
import { TTFlixLoader } from "@/components/TTFlixLoader";
import { getDetails } from "@/lib/tmdb.functions.app";

export function WatchPage() {
  const { mediaType, id } = useParams<{ mediaType: string; id: string }>();
  const [searchParams] = useSearchParams();
  const { user, profile, loading, profileLoading, isAdmin } = useAuth();
  const { activeProfile, profiles } = useProfile();
  // Fallback chain so admins and users who haven't picked a profile still save progress
  const effectiveProfile = activeProfile ?? profiles.find((p) => p.is_default) ?? profiles[0] ?? null;
  const navigate = useNavigate();
  const progressRef = useRef({ watched: 0, duration: 0 });
  const title = searchParams.get("title") ?? "";
  const poster = searchParams.get("poster") ?? "";
  const backdrop = searchParams.get("backdrop") ?? "";
  const season = Number(searchParams.get("season") ?? 1);
  const episode = Number(searchParams.get("episode") ?? 1);

  const type = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);
  const stillLoading = loading || profileLoading;
  const canWatch = isAdmin || (!!user && profile?.status === "approved");

  // Track current episode in a ref so persist() always uses the latest value
  // even when Videasy auto-advances to the next episode inside the iframe
  const currentEpisodeRef = useRef({ season, episode });
  const [saved, setSaved] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [explodeLoader, setExplodeLoader] = useState(false);
  const [exitVisible, setExitVisible] = useState(true);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerStartedRef = useRef(false);

  // Show exit button for 3s, then hide. Re-show on tap.
  const showExit = useCallback(() => {
    setExitVisible(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setExitVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (!loaderVisible) showExit();
    return () => { if (exitTimerRef.current) clearTimeout(exitTimerRef.current); };
  }, [loaderVisible, showExit]);

  const [src] = useState(() => streamUrl(type, tmdbId, season, episode));

  // Fetch runtime from TMDB so we always have a real duration even if the
  // player never sends postMessages (duration_seconds won't stay 0)
  useEffect(() => {
    getDetails({ data: { id: tmdbId, mediaType: type } }).then((details) => {
      const runtimeMins = details.runtime;
      if (runtimeMins && runtimeMins > 0) {
        // Only set if player hasn't already reported a real duration
        if (progressRef.current.duration === 0) {
          progressRef.current.duration = runtimeMins * 60;
        }
      }
    }).catch(() => { /* ignore — player postMessages are the primary source */ });
  }, [tmdbId, type]);

  const triggerExplosion = useCallback(() => setExplodeLoader(true), []);

  // Save an initial "started" record the moment the player loads
  // so the item appears in Continue Watching even if the user exits immediately
  const savedInitial = useRef(false);
  const saveInitial = useCallback(async () => {
    if (savedInitial.current) return;
    if (!user || !effectiveProfile || !title) return;
    savedInitial.current = true;
    await saveProgress({
      user_id: user.id,
      profile_id: effectiveProfile.id,
      tmdb_id: tmdbId,
      media_type: type,
      title,
      poster_path: poster || null,
      backdrop_path: backdrop || null,
      watched_seconds: 10,
      duration_seconds: progressRef.current.duration > 0 ? Math.floor(progressRef.current.duration) : 0,
      season: type === "tv" ? season : null,
      episode: type === "tv" ? episode : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop, season, episode]);

  // Fallback: dismiss loader after 6s and save initial record
  useEffect(() => {
    const t = setTimeout(() => {
      triggerExplosion();
      saveInitial();
    }, 6000);
    return () => clearTimeout(t);
  }, [triggerExplosion, saveInitial]);

  const persist = useCallback(async (watched: number, duration: number) => {
    if (!user || !effectiveProfile || watched < 10) return;
    const { season: currentSeason, episode: currentEp } = currentEpisodeRef.current;
    await saveProgress({
      user_id: user.id,
      profile_id: effectiveProfile.id,
      tmdb_id: tmdbId,
      media_type: type,
      title: title || `Title ${tmdbId}`,
      poster_path: poster || null,
      backdrop_path: backdrop || null,
      watched_seconds: Math.floor(watched),
      duration_seconds: duration > 0 ? Math.floor(duration) : 0,
      season: type === "tv" ? currentSeason : null,
      episode: type === "tv" ? currentEp : null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;

        // Player ready signal — explode loader + save initial record
        if (d?.type === "ready" || d?.event === "ready") {
          triggerExplosion();
          saveInitial();
        }

        // Videasy episode change — update our tracking ref so progress saves to the right episode
        if (d?.type === "episodeChange" || d?.event === "episodeChange") {
          if (d?.season) currentEpisodeRef.current.season = Number(d.season);
          if (d?.episode) currentEpisodeRef.current.episode = Number(d.episode);
          // Reset progress for the new episode
          progressRef.current = { watched: 0, duration: 0 };
          savedInitial.current = false;
        }

        // Progress tick = video is actually playing
        if (d?.timestamp !== undefined && d?.duration !== undefined) {
          progressRef.current = { watched: d.timestamp, duration: d.duration };
          if (!playerStartedRef.current) {
            playerStartedRef.current = true;
            triggerExplosion();
            saveInitial();
          }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [triggerExplosion, saveInitial]);

  // Save every 15 seconds during playback
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      const { watched, duration } = progressRef.current;
      if (watched > 10) persist(watched, duration);
    }, 15_000);
    return () => clearInterval(t);
  }, [user, tmdbId, persist]);

  // Save on exit (back button, app close)
  useEffect(() => {
    const save = () => {
      const { watched, duration } = progressRef.current;
      if (user && watched > 10) persist(watched, duration);
    };
    window.addEventListener("beforeunload", save);
    return () => { save(); window.removeEventListener("beforeunload", save); };
  }, [user, persist]);

  useEffect(() => {
    if (stillLoading) return;
    if (!canWatch) navigate("/");
  }, [stillLoading, canWatch, navigate]);

  if (stillLoading) return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>
  );
  if (!canWatch) return null;

  return (
    <div className="fixed inset-0 bg-black">
      {/* TTFLIX splash — shows movie backdrop behind the logo */}
      {loaderVisible && (
        <TTFlixLoader
          explode={explodeLoader}
          backdrop={backdrop || poster}
          onDone={() => setLoaderVisible(false)}
        />
      )}

      {/* Player — fills entire screen */}
      <iframe
        src={src}
        title="Player"
        className="absolute inset-0 h-full w-full border-0"
        referrerPolicy="no-referrer"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
      />

      {/* Full-screen tap zone — sits below exit controls, shows exit on tap */}
      {!loaderVisible && !exitVisible && (
        <div
          className="absolute inset-x-0 bottom-0 top-16 z-10"
          onTouchStart={(e) => { e.stopPropagation(); showExit(); }}
          onClick={(e) => { e.stopPropagation(); showExit(); }}
        />
      )}

      {/* Exit button — fades out after 3s, tap anywhere to show again */}
      {!loaderVisible && (
        <div
          className="absolute top-0 left-0 z-20 p-3 transition-opacity duration-300"
          style={{ opacity: exitVisible ? 1 : 0, pointerEvents: exitVisible ? "auto" : "none" }}
        >
          <button
            onTouchStart={(e) => { e.stopPropagation(); navigate("/"); }}
            onClick={(e) => { e.stopPropagation(); navigate("/"); }}
            className="flex items-center gap-2 rounded-full bg-black/80 px-4 py-2.5 text-sm font-bold text-white"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <X className="h-4 w-4" /> Exit
          </button>
        </div>
      )}

      {saved && !loaderVisible && (
        <div className="absolute top-3 right-3 z-20">
          <span className="rounded-full bg-primary/30 px-3 py-1 text-xs font-medium text-primary">
            Progress saved
          </span>
        </div>
      )}
    </div>
  );
}
