import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { X, SkipForward, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { getProviders } from "@/lib/stream";
import { saveProgress } from "@/lib/continue-watching";
import { TTFlixLoader } from "@/components/TTFlixLoader";
import { getDetails, getSeasonEpisodes } from "@/lib/tmdb.functions.app";
import { supabase, PLANS } from "@/lib/supabase";

// Module-level caches — survive React navigation remounts within the same session
const seasonEpCountCache: Map<string, number> = new Map(); // key: `${tmdbId}-${season}`
const totalSeasonsCache:  Map<number, number>  = new Map(); // key: tmdbId

export function WatchPage() {
  const { mediaType, id } = useParams<{ mediaType: string; id: string }>();
  const [searchParams] = useSearchParams();
  const { user, profile, session, loading, profileLoading, isAdmin } = useAuth();
  const { activeProfile, profiles } = useProfile();
  const effectiveProfile = activeProfile ?? profiles.find((p) => p.is_default) ?? profiles[0] ?? null;
  const navigate = useNavigate();
  const progressRef = useRef({ watched: 0, duration: 0, hasPostMessage: false });
  const watchStartRef = useRef<number>(Date.now());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [explodeLoader, setExplodeLoader] = useState(false);
  const [loaderKey, setLoaderKey] = useState(0);
  const [exitVisible, setExitVisible] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerStartedRef = useRef(false);
  const watchIdRef = useRef<string | null>(null);

  const showExit = useCallback(() => {
    setExitVisible(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setExitVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (!loaderVisible) showExit();
    return () => { if (exitTimerRef.current) clearTimeout(exitTimerRef.current); };
  }, [loaderVisible, showExit]);

  const title      = searchParams.get("title") ?? "";
  const poster     = searchParams.get("poster") ?? "";
  const backdrop   = searchParams.get("backdrop") ?? "";
  const season     = Number(searchParams.get("season") ?? 1);
  const episode    = Number(searchParams.get("episode") ?? 1);
  // progress=0 means force start from beginning (passed when title was reset)
  const progressParam = searchParams.get("progress") !== null ? Number(searchParams.get("progress")) : undefined;
  const bustParam    = searchParams.get("_") ?? "";
  // Carry episode/season counts through URL so remounts don't lose them
  const urlTotalEps  = searchParams.get("totalEps")  ? Number(searchParams.get("totalEps"))  : null;
  const urlTotalSeas = searchParams.get("totalSeas") ? Number(searchParams.get("totalSeas")) : null;

  const type   = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);

  const contentKey  = `${type}-${tmdbId}-${season}-${episode}-${progressParam ?? ""}-${bustParam}`;
  const stillLoading = loading || profileLoading;
  const canWatch     = isAdmin || (!!user && profile?.status === "approved");
  const isKidsProfile = activeProfile?.is_kids ?? false;

  const KIDS_BLOCKED_RATINGS = new Set(["PG-13", "R", "NC-17", "TV-14", "TV-MA", "18+", "18", "X"]);
  const [kidsBlocked, setKidsBlocked] = useState(false);
  const kidsBlockedRef   = useRef(false);
  const [kidsBlockedRating, setKidsBlockedRating] = useState<string | null>(null);
  const kidsCheckDoneRef = useRef(!isKidsProfile);

  useEffect(() => {
    if (!isKidsProfile) { kidsCheckDoneRef.current = true; kidsBlockedRef.current = false; return; }
    kidsCheckDoneRef.current = false;
    kidsBlockedRef.current   = false;
    getDetails({ data: { id: tmdbId, mediaType: type } }).then((details) => {
      const cert = details.certification?.toUpperCase() ?? null;
      if (cert && KIDS_BLOCKED_RATINGS.has(cert)) {
        kidsBlockedRef.current = true;
        setKidsBlocked(true);
        setKidsBlockedRating(cert);
      }
    }).catch(() => {}).finally(() => { kidsCheckDoneRef.current = true; });
  }, [tmdbId, type, isKidsProfile]);

  const currentEpisodeRef = useRef({ season, episode });
  useEffect(() => { currentEpisodeRef.current = { season, episode }; }, [season, episode]);

  // ── Next episode ──────────────────────────────────────────────────────────
  // Module-level caches survive remounts within the same browser session.
  // On first-ever load of a show they start null, so we fetch immediately.
  // Optimistic fallback keeps the button visible while fetching.

  const [totalSeasons, setTotalSeasons] = useState<number | null>(
    totalSeasonsCache.get(tmdbId) ?? urlTotalSeas ?? null
  );
  const [episodeCount, setEpisodeCount] = useState<number | null>(
    seasonEpCountCache.get(`${tmdbId}-${season}`) ?? urlTotalEps ?? null
  );
  const [episodeCounts, setEpisodeCounts] = useState<number[]>([]);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);

  // Fetch totalSeasons (skip if cached)
  useEffect(() => {
    if (type !== "tv") return;
    if (totalSeasonsCache.has(tmdbId)) {
      setTotalSeasons(totalSeasonsCache.get(tmdbId)!);
      return;
    }
    getDetails({ data: { id: tmdbId, mediaType: "tv" } })
      .then((d) => {
        if (d?.number_of_seasons) {
          totalSeasonsCache.set(tmdbId, d.number_of_seasons);
          setTotalSeasons(d.number_of_seasons);
        }
      }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, type]);

  // Fetch episodeCount for current season (skip if cached)
  useEffect(() => {
    if (type !== "tv") return;
    const key = `${tmdbId}-${season}`;
    if (seasonEpCountCache.has(key)) {
      setEpisodeCount(seasonEpCountCache.get(key)!);
      return;
    }
    getSeasonEpisodes({ data: { id: tmdbId, season } })
      .then((eps: any[]) => {
        if (eps?.length) {
          seasonEpCountCache.set(key, eps.length);
          setEpisodeCount(eps.length);
        }
      }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, type, season]);

  // Fetch all season counts once totalSeasons is known — populates cache for future navigations
  useEffect(() => {
    if (type !== "tv" || totalSeasons === null) return;
    Promise.all(
      Array.from({ length: totalSeasons }, (_, i) =>
        getSeasonEpisodes({ data: { id: tmdbId, season: i + 1 } })
          .then((eps: any[]) => {
            const count = eps?.length ?? 0;
            seasonEpCountCache.set(`${tmdbId}-${i + 1}`, count);
            return count;
          }).catch(() => 0)
      )
    ).then(setEpisodeCounts).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, type, totalSeasons]);

  // Close season picker on outside click
  useEffect(() => {
    if (!showSeasonPicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-season-picker]")) setShowSeasonPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSeasonPicker]);

  // nextEp — two-tier logic:
  // 1. If we have real data (from cache or fetch) → use it precisely.
  // 2. If still loading (null) → show optimistically so button is never hidden on first load.
  //    Optimistic cap: episode+1 always shown while episodeCount unknown.
  //    Season+1 shown while totalSeasons unknown only if we finished this season.
  const nextEp = (() => {
    if (type !== "tv") return null;

    // Prefer the full episodeCounts array (all seasons), fall back to single-season count
    const curSeasonCount = episodeCounts.length >= season
      ? episodeCounts[season - 1]
      : episodeCount;

    if (curSeasonCount !== null) {
      // We know exactly how many episodes are in this season
      if (episode < curSeasonCount) return { season, episode: episode + 1 };
      // Last episode of this season — check next season
      if (totalSeasons !== null) {
        return season < totalSeasons ? { season: season + 1, episode: 1 } : null;
      }
      // totalSeasons still loading — show S+1 E1 optimistically
      return { season: season + 1, episode: 1 };
    }

    // episodeCount still loading — show next ep optimistically
    // This covers first-ever load before any fetch returns
    return { season, episode: episode + 1 };
  })();

  const providers        = getProviders(type, tmdbId, season, episode, progressParam);
  const [providerIndex, setProviderIndex] = useState(0);
  const [src, setSrc]    = useState(() => providers[0].url);
  const providerSignalRef = useRef(false);

  useEffect(() => {
    // Read progressParam fresh from searchParams at effect time (not stale closure)
    const p = searchParams.get("progress") !== null ? Number(searchParams.get("progress")) : undefined;
    const freshProviders = getProviders(type, tmdbId, season, episode, p);
    setProviderIndex(0);
    setSrc(freshProviders[0].url);
    providerSignalRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    providerSignalRef.current = false;
    fallbackTimerRef.current = setTimeout(() => {
      if (!providerSignalRef.current) {
        setProviderIndex((prev) => {
          const next = prev + 1;
          if (next < providers.length) { setSrc(providers[next].url); return next; }
          return prev;
        });
      }
    }, 15_000);
  }, [providers]);

  useEffect(() => {
    startFallbackTimer();
    return () => { if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current); };
  }, [src, startFallbackTimer]);

  // ── Screen limit ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !session || !profile || isAdmin) return;
    const sessionId = session.access_token;
    const max = PLANS[profile.plan]?.screens ?? 2;
    async function registerWatch() {
      const staleDate = new Date(Date.now() - 30 * 1000).toISOString();
      await supabase.from("active_watches").delete().eq("user_id", user!.id).lt("last_ping", staleDate);
      const { data: existing } = await supabase.from("active_watches").select("id")
        .eq("user_id", user!.id).eq("session_id", sessionId).maybeSingle();
      if (existing) { watchIdRef.current = existing.id; return; }
      const { count } = await supabase.from("active_watches")
        .select("*", { count: "exact", head: true }).eq("user_id", user!.id);
      if ((count ?? 0) >= max) {
        const planName  = PLANS[profile!.plan]?.name ?? profile!.plan;
        const upgradeMsg = (profile!.plan === "basic" || profile!.plan === "basic_annual")
          ? " Upgrade to Premium for up to 5 screens." : "";
        setScreenError(`Too many screens watching. Your ${planName} plan allows ${max} screen${max === 1 ? "" : "s"}.${upgradeMsg}`);
        return;
      }
      const { data: inserted } = await supabase.from("active_watches").insert({
        user_id: user!.id, session_id: sessionId, tmdb_id: tmdbId, media_type: type,
        title: title || `Title ${tmdbId}`, last_ping: new Date().toISOString(),
      }).select("id").single();
      if (inserted) watchIdRef.current = inserted.id;
    }
    registerWatch();
    const ping = setInterval(() => {
      if (watchIdRef.current)
        supabase.from("active_watches").update({ last_ping: new Date().toISOString() }).eq("id", watchIdRef.current);
    }, 3000);
    return () => {
      clearInterval(ping);
      if (watchIdRef.current) supabase.from("active_watches").delete().eq("id", watchIdRef.current);
    };
  }, [user, session, profile, isAdmin, tmdbId, type, title, season, episode]);

  // ── Duration fetch ────────────────────────────────────────────────────────
  const durationReadyRef = useRef(false);
  useEffect(() => {
    durationReadyRef.current = false;
    async function fetchDuration() {
      try {
        const details = await getDetails({ data: { id: tmdbId, mediaType: type } });
        let runtimeMins = details.runtime;
        if (!runtimeMins && type === "tv") {
          try {
            const eps = await getSeasonEpisodes({ data: { id: tmdbId, season } });
            const ep  = eps.find((e: { episode_number: number; runtime?: number | null }) => e.episode_number === episode);
            runtimeMins = ep?.runtime ?? eps[0]?.runtime ?? null;
          } catch { /* ignore */ }
        }
        if (runtimeMins && runtimeMins > 0) progressRef.current.duration = runtimeMins * 60;
      } catch { /* ignore */ }
      durationReadyRef.current = true;
    }
    fetchDuration();
  }, [tmdbId, type, season, episode]);

  const triggerExplosion = useCallback(() => { setExplodeLoader(true); }, []);
  const onLoaderDone     = useCallback(() => setLoaderVisible(false), []);
  const savedInitial     = useRef(false);

  useEffect(() => {
    setLoaderVisible(true);
    setExplodeLoader(false);
    setLoaderKey((k) => k + 1);
    playerStartedRef.current = false;
    savedInitial.current     = false;
    progressRef.current      = { watched: 0, duration: 0, hasPostMessage: false };
    watchStartRef.current    = Date.now();
    durationReadyRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  const saveInitial = useCallback(async () => {
    if (savedInitial.current || !user || !effectiveProfile || !title) return;
    if (!kidsCheckDoneRef.current) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => { if (kidsCheckDoneRef.current) { clearInterval(check); resolve(); } }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });
    }
    if (kidsBlockedRef.current) return;
    savedInitial.current = true;
    if (!durationReadyRef.current) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => { if (durationReadyRef.current) { clearInterval(check); resolve(); } }, 200);
        setTimeout(() => { clearInterval(check); resolve(); }, 6000);
      });
    }
    const duration = progressRef.current.duration;
    let safeDuration = duration > 0 ? Math.floor(duration) : 0;
    if (safeDuration === 0) {
      const { data: existing } = await supabase.from("watch_progress").select("duration_seconds")
        .eq("user_id", user.id).eq("profile_id", effectiveProfile.id)
        .eq("tmdb_id", tmdbId).eq("media_type", type).maybeSingle();
      safeDuration = existing?.duration_seconds ?? 0;
    }
    if (safeDuration > 0 && progressRef.current.duration === 0) progressRef.current.duration = safeDuration;
    await saveProgress({
      user_id: user.id, profile_id: effectiveProfile.id, tmdb_id: tmdbId, media_type: type,
      title, poster_path: poster || null, backdrop_path: backdrop || null,
      watched_seconds: 10, duration_seconds: safeDuration,
      season: type === "tv" ? currentEpisodeRef.current.season : null,
      episode: type === "tv" ? currentEpisodeRef.current.episode : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop]);

  // Dismiss loader after 1s
  useEffect(() => {
    if (!isKidsProfile) {
      const t = setTimeout(() => triggerExplosion(), 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (kidsCheckDoneRef.current) { triggerExplosion(); return; }
      const poll = setInterval(() => {
        if (kidsCheckDoneRef.current) { clearInterval(poll); triggerExplosion(); }
      }, 100);
      setTimeout(() => { clearInterval(poll); triggerExplosion(); }, 6000);
    }, 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerExplosion, isKidsProfile, contentKey]);

  const persist = useCallback(async (watched: number, duration: number) => {
    if (!user || !effectiveProfile || watched < 10) return;
    if (kidsBlockedRef.current) return;
    const { season: currentSeason, episode: currentEp } = currentEpisodeRef.current;
    let safeDuration = duration > 0 ? Math.floor(duration) : 0;
    if (safeDuration === 0) {
      const { data: existing } = await supabase.from("watch_progress").select("duration_seconds")
        .eq("user_id", user.id).eq("profile_id", effectiveProfile.id)
        .eq("tmdb_id", tmdbId).eq("media_type", type).maybeSingle();
      safeDuration = existing?.duration_seconds ?? 0;
    }
    await saveProgress({
      user_id: user.id, profile_id: effectiveProfile.id, tmdb_id: tmdbId, media_type: type,
      title: title || `Title ${tmdbId}`, poster_path: poster || null, backdrop_path: backdrop || null,
      watched_seconds: safeDuration > 0 ? Math.min(Math.floor(watched), safeDuration) : Math.floor(watched),
      duration_seconds: safeDuration,
      season: type === "tv" ? currentSeason : null, episode: type === "tv" ? currentEp : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop]);

  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; }, [persist]);

  // ── postMessage from iframe player ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.type === "notFound" || d?.event === "notFound" ||
            d?.type === "error"    || d?.event === "error") {
          const next = providerIndex + 1;
          if (next < providers.length) { setProviderIndex(next); setSrc(providers[next].url); }
          return;
        }
        if (d?.type === "ready" || d?.event === "ready") {
          providerSignalRef.current = true; triggerExplosion(); saveInitial();
        }
        if (d?.type === "episodeChange" || d?.event === "episodeChange") {
          if (d?.season)  currentEpisodeRef.current.season  = Number(d.season);
          if (d?.episode) currentEpisodeRef.current.episode = Number(d.episode);
          progressRef.current  = { watched: 0, duration: 0, hasPostMessage: false };
          savedInitial.current = false;
          watchStartRef.current = Date.now();
          persistRef.current(10, progressRef.current.duration);
        }
        if (d?.timestamp !== undefined && d?.duration !== undefined) {
          const newDuration = d.duration > 0 ? d.duration : progressRef.current.duration;
          progressRef.current = { watched: d.timestamp, duration: newDuration, hasPostMessage: true };
          providerSignalRef.current = true;
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
  }, [triggerExplosion, saveInitial, providerIndex, providers]);

  // ── iframe src load ───────────────────────────────────────────────────────
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || kidsBlockedRef.current) return;
    progressRef.current.hasPostMessage = false;
    playerStartedRef.current = false;
    iframe.src = "about:blank";
    const t = setTimeout(() => { if (iframeRef.current) iframeRef.current.src = src; }, 50);
    return () => clearTimeout(t);
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Progress save interval + beforeunload ─────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      const wallClock = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration  = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClock;
      const watched   = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (watched > 10) persistRef.current(watched, duration);
    }, 15_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tmdbId]);

  useEffect(() => {
    const save = () => {
      const wallClock  = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration   = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClock;
      const watched    = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (user && watched > 10) persistRef.current(watched, duration);
    };
    window.addEventListener("beforeunload", save);
    return () => { save(); window.removeEventListener("beforeunload", save); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Android native player ─────────────────────────────────────────────────
  const playerLaunchedRef = useRef(false);
  useEffect(() => { playerLaunchedRef.current = false; }, [contentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stillLoading || !canWatch || !!screenError) return;
    if (playerLaunchedRef.current) return;
    async function launch() {
      if (!kidsCheckDoneRef.current) {
        await new Promise<void>((resolve) => {
          const poll = setInterval(() => { if (kidsCheckDoneRef.current) { clearInterval(poll); resolve(); } }, 50);
          setTimeout(() => { clearInterval(poll); resolve(); }, 5000);
        });
      }
      if (kidsBlockedRef.current || playerLaunchedRef.current) return;
      playerLaunchedRef.current = true;
      saveInitial();
      setTimeout(() => {
        const primaryUrl = providers[0].url;
        const android = (window as any).AndroidPlayer;
        if (android?.openWithNext && nextEp) {
          const nextUrl = getProviders(type, tmdbId, nextEp.season, nextEp.episode)[0]?.url;
          if (nextUrl) {
            // Pass all season episode counts so PlayerActivity knows when to stop
            const countsStr = episodeCounts.length > 0
              ? episodeCounts.join(",")
              : String(episodeCount ?? 0);
            android.openWithNext(primaryUrl, nextUrl, episodeCount ?? 0, totalSeasons, countsStr);
            return;
          }
        }
        android?.open(primaryUrl);      }, 500);
    }
    launch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillLoading, canWatch, screenError]);

  useEffect(() => {
    const onResume = (e: Event) => {
      // If PlayerActivity tells us which episode it ended on, update our ref
      // so persist() saves the correct episode to Continue Watching
      const detail = (e as CustomEvent).detail;
      if (detail?.season && detail?.episode) {
        currentEpisodeRef.current = { season: detail.season, episode: detail.episode };
      }
      const wallClock  = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration   = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClock;
      const watched    = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (user && watched > 10) persistRef.current(watched, duration);
      navigate("/");
    };
    window.addEventListener("androidresume", onResume);
    return () => window.removeEventListener("androidresume", onResume);
  }, [navigate, user]);

  // When native Next button is tapped, advance episode tracking and push next URL back
  useEffect(() => {
    const onNext = () => {
      // Save progress for the episode just finished
      const wallClock  = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration   = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClock;
      const watched    = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (watched > 10) persistRef.current(watched, duration);

      // Advance current episode ref
      // Use per-season episode counts if available, otherwise fall back to current season count
      const cur = currentEpisodeRef.current;
      const curSeasonCount = episodeCounts.length >= cur.season
        ? episodeCounts[cur.season - 1]
        : (episodeCount ?? 0);
      const newEp = cur.episode < curSeasonCount
        ? { season: cur.season, episode: cur.episode + 1 }
        : { season: cur.season + 1, episode: 1 };
      currentEpisodeRef.current = newEp;

      // Reset progress tracking for new episode
      progressRef.current  = { watched: 0, duration: 0, hasPostMessage: false };
      watchStartRef.current = Date.now();
      savedInitial.current  = false;

      // Save the new episode position immediately
      persistRef.current(10, 0);

      // Compute next-next episode using per-season counts
      const newSeasonCount = episodeCounts.length >= newEp.season
        ? episodeCounts[newEp.season - 1]
        : (episodeCount ?? 0);
      const nextSeason  = newEp.episode < newSeasonCount ? newEp.season : newEp.season < (totalSeasons ?? 0) ? newEp.season + 1 : null;
      const nextEpisode = newEp.episode < newSeasonCount ? newEp.episode + 1 : nextSeason ? 1 : null;

      if (nextSeason && nextEpisode) {
        const nextNextUrl = getProviders(type, tmdbId, nextSeason, nextEpisode)[0]?.url ?? "";
        (window as any).TTFlixNative?.setNextUrl?.(nextNextUrl);
      } else {
        // End of series — tell native to hide the button
        (window as any).TTFlixNative?.setNextUrl?.("");
      }
    };
    window.addEventListener("androidNextEpisode", onNext);
    return () => window.removeEventListener("androidNextEpisode", onNext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, type, tmdbId, episodeCount, totalSeasons]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "GoBack" || e.key === "Back" || e.key === "BrowserBack") { e.preventDefault(); navigate("/"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  useEffect(() => {
    const android = (window as any).AndroidOrientation;
    if (android?.lockLandscape) android.lockLandscape();
    else { try { (screen.orientation as any).lock("landscape").catch(() => {}); } catch {} }
    return () => {
      if (android?.lockPortrait) android.lockPortrait();
      else { try { screen.orientation.unlock(); } catch {} }
    };
  }, []);

  if (stillLoading) return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>
  );
  if (!canWatch) return null;
  if (screenError) return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="text-6xl">📺</div>
      <h2 className="text-xl font-bold text-white">Too Many Screens</h2>
      <p className="text-sm text-white/70 max-w-xs">{screenError}</p>
      <button onClick={() => navigate("/")} className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white">Back to Home</button>
      {profile?.plan === "basic" && (
        <button onClick={() => navigate("/account")} className="rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white/80">Upgrade Plan</button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black" onMouseMove={showExit} onTouchStart={showExit}>
      <TTFlixLoader key={loaderKey} explode={explodeLoader} persistent={true} backdrop={backdrop || poster} onDone={onLoaderDone} />

      {!kidsBlocked && (
        <iframe ref={iframeRef} src={src}
          className="absolute inset-0 h-full w-full border-0 z-10"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen title={title || "TTFlix Player"} />
      )}

      {/* Transparent tap-catcher above the iframe — triggers controls visibility on mobile tap.
          pointer-events-none after controls are visible so taps reach the iframe normally. */}
      {!kidsBlocked && !exitVisible && (
        <div
          className="absolute inset-0 z-20"
          onTouchStart={showExit}
          onClick={showExit}
        />
      )}

      {kidsBlocked && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="text-6xl">🔒</div>
          <h2 className="text-xl font-bold text-white">Not Available for Kids</h2>
          <p className="text-sm text-white/70 max-w-xs">
            This title is rated <span className="font-bold text-primary">{kidsBlockedRating}</span> and cannot be played on a Kids profile.
          </p>
          <button autoFocus onClick={() => navigate("/")}
            className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black">
            Go Back
          </button>
        </div>
      )}

      {/* Exit button — shows on tap/move, fades after 3s */}
      {!loaderVisible && !kidsBlocked && (
        <>
          <button
            onClick={() => navigate("/")}
            tabIndex={0}
            data-tv-card
            aria-label="Exit player"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/"); } }}
            className={`absolute left-4 top-4 z-40 flex items-center justify-center rounded-full bg-black/60 p-3 text-white transition
              hover:bg-black/90
              focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black
              ${exitVisible ? "opacity-100" : "opacity-0"}`}
          >
            <X className="h-6 w-6" />
          </button>

          {/* Top-right controls — season picker + next episode — fade with exit button */}
          {type === "tv" && (
            <div
              data-season-picker
              className={`absolute top-4 right-4 z-40 flex items-center gap-2 transition
                ${exitVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
            >
              {/* Season picker — always show for TV */}
              <div className="relative">
                  {/* Dropdown — opens downward */}
                  {showSeasonPicker && (
                    <div className="absolute top-full right-0 mt-2 max-h-56 w-36 overflow-y-auto rounded-xl border border-white/20 bg-black/95 shadow-2xl">
                      {Array.from({ length: totalSeasons ?? season }, (_, i) => i + 1).map((s) => (
                        <button
                          key={s}
                          tabIndex={0}
                          data-tv-card
                          onClick={() => {
                            setShowSeasonPicker(false);
                            navigate(`/watch/tv/${tmdbId}?title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&backdrop=${encodeURIComponent(backdrop)}&season=${s}&episode=1`);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setShowSeasonPicker(false);
                              navigate(`/watch/tv/${tmdbId}?title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&backdrop=${encodeURIComponent(backdrop)}&season=${s}&episode=1`);
                            }
                            if (e.key === "Escape") { e.preventDefault(); setShowSeasonPicker(false); }
                          }}
                          className={`w-full px-4 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-white/20
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
                            ${s === season ? "text-primary" : ""}`}
                        >
                          Season {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Trigger */}
                  <button
                    tabIndex={0}
                    data-tv-card
                    aria-label="Season picker"
                    aria-expanded={showSeasonPicker}
                    onClick={() => setShowSeasonPicker((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowSeasonPicker((v) => !v); }
                      if (e.key === "Escape") { e.preventDefault(); setShowSeasonPicker(false); }
                    }}
                    className="flex items-center gap-2 rounded-full border-2 border-white/50 bg-black/80 px-5 py-3 text-sm font-bold text-white transition
                      hover:bg-white hover:text-black hover:border-white
                      focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"
                  >
                    Season {season}
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showSeasonPicker ? "rotate-180" : ""}`} />
                  </button>
                </div>

              {/* Next Episode button */}
              {nextEp && (
                <button
                  onClick={() => {
                    const wallClock  = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
                    const duration   = progressRef.current.duration;
                    const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClock;
                    const watched    = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
                    if (watched > 10) persistRef.current(watched, duration);
                    const nextSeasonCount = nextEp.season === season
                      ? episodeCount
                      : episodeCounts.length >= nextEp.season
                        ? episodeCounts[nextEp.season - 1]
                        : seasonEpCountCache.get(`${tmdbId}-${nextEp.season}`) ?? null;
                    const countParams = [
                      nextSeasonCount != null ? `&totalEps=${nextSeasonCount}` : "",
                      totalSeasons != null    ? `&totalSeas=${totalSeasons}`   : "",
                    ].join("");
                    navigate(`/watch/tv/${tmdbId}?title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&backdrop=${encodeURIComponent(backdrop)}&season=${nextEp.season}&episode=${nextEp.episode}&progress=0${countParams}`);
                  }}
                  tabIndex={0}
                  data-tv-card
                  aria-label={`Next S${nextEp.season} E${nextEp.episode}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const wallClock  = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
                      const duration   = progressRef.current.duration;
                      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClock;
                      const watched    = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
                      if (watched > 10) persistRef.current(watched, duration);
                      const nextSeasonCount = nextEp.season === season
                        ? episodeCount
                        : episodeCounts.length >= nextEp.season
                          ? episodeCounts[nextEp.season - 1]
                          : seasonEpCountCache.get(`${tmdbId}-${nextEp.season}`) ?? null;
                      const countParams = [
                        nextSeasonCount != null ? `&totalEps=${nextSeasonCount}` : "",
                        totalSeasons != null    ? `&totalSeas=${totalSeasons}`   : "",
                      ].join("");
                      navigate(`/watch/tv/${tmdbId}?title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&backdrop=${encodeURIComponent(backdrop)}&season=${nextEp.season}&episode=${nextEp.episode}&progress=0${countParams}`);
                    }
                  }}
                  className="flex items-center gap-2 rounded-full border-2 border-white/50 bg-black/80 px-5 py-3 text-sm font-bold text-white transition
                    hover:bg-white hover:text-black hover:border-white
                    focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"
                >
                  <SkipForward className="h-5 w-5 shrink-0" />
                  Next Episode
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
