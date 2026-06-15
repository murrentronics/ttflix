import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { streamUrl } from "@/lib/stream";
import { saveProgress } from "@/lib/continue-watching";
import { TTFlixLoader } from "@/components/TTFlixLoader";
import { getDetails, getSeasonEpisodes } from "@/lib/tmdb.functions.app";
import { supabase, PLANS } from "@/lib/supabase";

export function WatchPage() {
  const { mediaType, id } = useParams<{ mediaType: string; id: string }>();
  const [searchParams] = useSearchParams();
  const { user, profile, session, loading, profileLoading, isAdmin } = useAuth();
  const { activeProfile, profiles } = useProfile();
  const effectiveProfile = activeProfile ?? profiles.find((p) => p.is_default) ?? profiles[0] ?? null;
  const navigate = useNavigate();
  const progressRef = useRef({ watched: 0, duration: 0, hasPostMessage: false });
  // Wall-clock tracking — only counts while the page is visible
  const watchStartRef = useRef<number>(Date.now());
  const accumulatedRef = useRef<number>(0); // seconds accumulated before last hide
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [explodeLoader, setExplodeLoader] = useState(false);
  const [exitVisible, setExitVisible] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerStartedRef = useRef(false);
  const watchIdRef = useRef<string | null>(null);

  const showExit = useCallback(() => {
    setExitVisible(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setExitVisible(false), 5000);
  }, []);

  useEffect(() => {
    if (!loaderVisible) showExit();
    return () => { if (exitTimerRef.current) clearTimeout(exitTimerRef.current); };
  }, [loaderVisible, showExit]);

  const title = searchParams.get("title") ?? "";
  const poster = searchParams.get("poster") ?? "";
  const backdrop = searchParams.get("backdrop") ?? "";
  const season = Number(searchParams.get("season") ?? 1);
  const episode = Number(searchParams.get("episode") ?? 1);

  const type = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);
  const stillLoading = loading || profileLoading;
  const canWatch = isAdmin || (!!user && profile?.status === "approved");

  const currentEpisodeRef = useRef({ season, episode });

  const [src] = useState(() => streamUrl(type, tmdbId, season, episode));

  // ── Screen limit check + register active watch ──────────────────────────────
  useEffect(() => {
    if (!user || !session || !profile || isAdmin) return;

    const sessionId = session.access_token;
    const max = PLANS[profile.plan]?.screens ?? 2;

    async function registerWatch() {
      // Purge stale watches (no ping in > 5 min = player closed without cleanup)
      const staleDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await supabase
        .from("active_watches")
        .delete()
        .eq("user_id", user!.id)
        .lt("last_ping", staleDate);

      // Check if this session is already watching (resume/reload)
      const { data: existing } = await supabase
        .from("active_watches")
        .select("id")
        .eq("user_id", user!.id)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (existing) {
        watchIdRef.current = existing.id;
        return;
      }

      // Count active screens
      const { count } = await supabase
        .from("active_watches")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);

      if ((count ?? 0) >= max) {
        const planName = PLANS[profile!.plan]?.name ?? profile!.plan;
        const upgradeMsg = profile!.plan === "basic"
          ? " Upgrade to Premium for up to 5 screens."
          : "";
        setScreenError(`Too many screens watching. Your ${planName} plan allows ${max} screen${max === 1 ? "" : "s"}.${upgradeMsg}`);
        return;
      }

      // Register this watch
      const { data: inserted } = await supabase
        .from("active_watches")
        .insert({
          user_id: user!.id,
          session_id: sessionId,
          tmdb_id: tmdbId,
          media_type: type,
          title: title || `Title ${tmdbId}`,
          last_ping: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (inserted) watchIdRef.current = inserted.id;
    }

    registerWatch();

    // Ping every 30s to keep the watch alive
    const ping = setInterval(() => {
      if (watchIdRef.current) {
        supabase
          .from("active_watches")
          .update({ last_ping: new Date().toISOString() })
          .eq("id", watchIdRef.current);
      }
    }, 30_000);

    // Cleanup on unmount
    return () => {
      clearInterval(ping);
      if (watchIdRef.current) {
        supabase.from("active_watches").delete().eq("id", watchIdRef.current);
      }
    };
  }, [user, session, profile, isAdmin, tmdbId, type, title, season, episode]);

  // Fetch runtime from TMDB — primary duration source since Videasy postMessages
  // don't reliably fire inside Capacitor Android WebView
  const durationReadyRef = useRef(false);
  useEffect(() => {
    // Reset wall-clock on new title
    watchStartRef.current = Date.now();
    accumulatedRef.current = 0;
    durationReadyRef.current = false;

    async function fetchDuration() {
      try {
        const details = await getDetails({ data: { id: tmdbId, mediaType: type } });
        let runtimeMins = details.runtime;

        // TV shows: episode_run_time is often empty — fall back to fetching the
        // actual episode runtime from the season endpoint
        if (!runtimeMins && type === "tv") {
          try {
            const episodes = await getSeasonEpisodes({ data: { id: tmdbId, season } });
            const ep = episodes.find((e: { episode_number: number; runtime?: number | null }) => e.episode_number === episode);
            runtimeMins = ep?.runtime ?? episodes[0]?.runtime ?? null;
          } catch { /* ignore */ }
        }

        if (runtimeMins && runtimeMins > 0) {
          progressRef.current.duration = runtimeMins * 60;
        }
      } catch { /* ignore */ }
      durationReadyRef.current = true;
    }

    fetchDuration();
  }, [tmdbId, type, season, episode]);

  const triggerExplosion = useCallback(() => setExplodeLoader(true), []);

  const savedInitial = useRef(false);
  const saveInitial = useCallback(async () => {
    if (savedInitial.current) return;
    if (!user || !effectiveProfile || !title) return;
    savedInitial.current = true;
    // Wait up to 4s for TMDB duration to resolve before the initial save
    if (!durationReadyRef.current) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (durationReadyRef.current) { clearInterval(check); resolve(); }
        }, 200);
        setTimeout(() => { clearInterval(check); resolve(); }, 4000);
      });
    }
    // If TMDB duration still unknown, check DB for an existing value before saving
    let knownDuration = progressRef.current.duration;
    if (knownDuration <= 0) {
      const { data: existing } = await supabase
        .from("watch_progress")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .eq("profile_id", effectiveProfile.id)
        .eq("tmdb_id", tmdbId)
        .eq("media_type", type)
        .maybeSingle();
      knownDuration = existing?.duration_seconds ?? 0;
    }
    await saveProgress({
      user_id: user.id,
      profile_id: effectiveProfile.id,
      tmdb_id: tmdbId,
      media_type: type,
      title,
      poster_path: poster || null,
      backdrop_path: backdrop || null,
      watched_seconds: 10,
      duration_seconds: knownDuration,
      season: type === "tv" ? season : null,
      episode: type === "tv" ? episode : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop, season, episode]);

  useEffect(() => {
    const t = setTimeout(() => { triggerExplosion(); saveInitial(); }, 6000);
    return () => clearTimeout(t);
  }, [triggerExplosion, saveInitial]);

  const persist = useCallback(async (watched: number, duration: number) => {
    if (!user || !effectiveProfile || watched < 10) return;
    const { season: currentSeason, episode: currentEp } = currentEpisodeRef.current;

    // Build the upsert — only include duration_seconds when we know it
    // to avoid overwriting a previously saved correct value with 0
    const base = {
      user_id: user.id,
      profile_id: effectiveProfile.id,
      tmdb_id: tmdbId,
      media_type: type as "movie" | "tv",
      title: title || `Title ${tmdbId}`,
      poster_path: poster || null,
      backdrop_path: backdrop || null,
      watched_seconds: Math.floor(watched),
      season: type === "tv" ? currentSeason : null,
      episode: type === "tv" ? currentEp : null,
    };

    if (duration > 0) {
      await saveProgress({ ...base, duration_seconds: Math.floor(duration) });
    } else {
      // duration unknown — fetch current DB value and preserve it
      const { data: existing } = await supabase
        .from("watch_progress")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .eq("profile_id", effectiveProfile.id)
        .eq("tmdb_id", tmdbId)
        .eq("media_type", type)
        .maybeSingle();
      await saveProgress({ ...base, duration_seconds: existing?.duration_seconds ?? 0 });
    }
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.type === "ready" || d?.event === "ready") { triggerExplosion(); saveInitial(); }
        if (d?.type === "episodeChange" || d?.event === "episodeChange") {
          if (d?.season) currentEpisodeRef.current.season = Number(d.season);
          if (d?.episode) currentEpisodeRef.current.episode = Number(d.episode);
          progressRef.current = { watched: 0, duration: 0, hasPostMessage: false };
          savedInitial.current = false;
        }
        if (d?.timestamp !== undefined && d?.duration !== undefined) {
          // Never overwrite a known duration with 0 — Videasy sometimes sends duration: 0
          const newDuration = d.duration > 0 ? d.duration : progressRef.current.duration;
          progressRef.current = { watched: d.timestamp, duration: newDuration, hasPostMessage: true };
          if (!playerStartedRef.current) {
            playerStartedRef.current = true;
            triggerExplosion();
            saveInitial();
          }
        }
      } catch { }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [triggerExplosion, saveInitial]);

  // Pause wall-clock when user switches away, resume when they come back
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Freeze: add elapsed to accumulated, stop the clock
        accumulatedRef.current += Math.floor((Date.now() - watchStartRef.current) / 1000);
        watchStartRef.current = 0;
      } else {
        // Resume: restart the clock
        watchStartRef.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Keep a stable ref to the latest persist so the interval never captures a stale closure
  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; }, [persist]);

  // Save on exit only — wall-clock can't detect pause so we don't accumulate
  // the saveNow ref is stable so Exit button and unmount both call the same logic
  const saveNowRef = useRef<() => void>(() => {});
  saveNowRef.current = () => {
    const wallClock = accumulatedRef.current +
      (watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0);
    const watched = progressRef.current.hasPostMessage
      ? progressRef.current.watched
      : wallClock;
    const duration = progressRef.current.duration;
    if (user && watched > 10) persistRef.current(watched, duration);
  };

  // Save on unmount (Exit button triggers navigate which unmounts) + browser close
  useEffect(() => {
    const handler = () => saveNowRef.current();
    window.addEventListener("beforeunload", handler);
    return () => {
      saveNowRef.current();
      window.removeEventListener("beforeunload", handler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stillLoading) return;
    if (!canWatch) navigate("/");
  }, [stillLoading, canWatch, navigate]);

  if (stillLoading) return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>
  );
  if (!canWatch) return null;

  // Screen limit reached — show message instead of player
  if (screenError) return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="text-6xl">📺</div>
      <h2 className="text-xl font-bold text-white">Too Many Screens</h2>
      <p className="text-sm text-white/70 max-w-xs">{screenError}</p>
      <button
        onClick={() => navigate("/")}
        className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white"
      >
        Back to Home
      </button>
      {profile?.plan === "basic" && (
        <button
          onClick={() => navigate("/account")}
          className="rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white/80"
        >
          Upgrade Plan
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black">
      {loaderVisible && (
        <TTFlixLoader
          explode={explodeLoader}
          backdrop={backdrop || poster}
          onDone={() => setLoaderVisible(false)}
        />
      )}

      <iframe
        src={src}
        title="Player"
        className="absolute inset-0 h-full w-full border-0"
        referrerPolicy="no-referrer"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
      />

      {/* Transparent tap catcher — sits over iframe only when exit is hidden, shows exit on tap */}
      {!loaderVisible && !exitVisible && (
        <div
          className="absolute inset-0 z-10"
          style={{ background: "transparent" }}
          onTouchStart={(e) => { e.stopPropagation(); showExit(); }}
          onClick={(e) => { e.stopPropagation(); showExit(); }}
        />
      )}

      {!loaderVisible && (
        <div
          className="absolute top-0 left-0 z-20 p-3 transition-opacity duration-300"
          style={{ opacity: exitVisible ? 1 : 0, pointerEvents: exitVisible ? "auto" : "none" }}
        >
          <button
            onTouchStart={(e) => { e.stopPropagation(); saveNowRef.current(); navigate("/"); }}
            onClick={(e) => { e.stopPropagation(); saveNowRef.current(); navigate("/"); }}
            className="flex items-center gap-2 rounded-full bg-black/80 px-4 py-2.5 text-sm font-bold text-white"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <X className="h-4 w-4" /> Exit
          </button>
        </div>
      )}
    </div>
  );
}
