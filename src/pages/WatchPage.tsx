import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { X, SkipBack, SkipForward, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { getProviders } from "@/lib/stream";
import { saveProgress } from "@/lib/continue-watching";
import { getNextEpisode, getPrevEpisode, seasonCountsFor, isNearlyFinished } from "@/lib/next-episode";
import { TTFlixLoader } from "@/components/TTFlixLoader";
import { getDetails, getSeasonEpisodes } from "@/lib/tmdb.functions.app";
import { supabase } from "@/lib/supabase";
import { subscriberCanWatch } from "@/lib/admin";
import { claimScreenSlot, pingScreenSlot, screenLimitMessage, stopPlayingOnSlot } from "@/lib/screens";
import { useDetail } from "@/components/DetailContext";
import { isTvDevice, isTvActivateKey, arrowDir } from "@/lib/tv-navigation";

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
  const { open: openPreview } = useDetail();
  const progressRef = useRef({ watched: 0, duration: 0, hasPostMessage: false });
  const watchStartRef = useRef<number>(Date.now());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [explodeLoader, setExplodeLoader] = useState(false);
  const [loaderKey, setLoaderKey] = useState(0);
  const [exitVisible, setExitVisible] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [screenGate, setScreenGate] = useState<"checking" | "ok" | "blocked">("checking");
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
  const progressParam = searchParams.get("progress") !== null ? Number(searchParams.get("progress")) : undefined;
  const startOverSession = searchParams.get("startOver") === "1";
  // Carry episode/season counts through URL so remounts don't lose them
  const urlTotalEps  = searchParams.get("totalEps")  ? Number(searchParams.get("totalEps"))  : null;
  const urlTotalSeas = searchParams.get("totalSeas") ? Number(searchParams.get("totalSeas")) : null;

  const type   = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);

  const exitToPreview = useCallback(() => {
    if (tmdbId) openPreview({ id: tmdbId, mediaType: type, title });
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  }, [tmdbId, type, title, openPreview, navigate]);

  const focusExitButton = useCallback(() => {
    const btn = document.querySelector<HTMLElement>("[data-tv-exit]");
    if (!btn) return false;
    showExit();
    btn.focus();
    return true;
  }, [showExit]);

  const leaveExitButton = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.hasAttribute("data-tv-exit")) active.blur();
  }, []);

  const contentKey  = `${type}-${tmdbId}-${season}-${episode}`;
  const stillLoading = loading || profileLoading;
  const canWatch     = subscriberCanWatch(profile?.status, profile?.subscription_expires_at, profile?.role, isAdmin);
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

  // progress=0 is passed via URL param when starting from beginning

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

  const lookupCounts = seasonCountsFor(season, episodeCount, episodeCounts);
  const nextEp = type === "tv"
    ? getNextEpisode(season, episode, lookupCounts, totalSeasons)
    : null;
  const prevEp = type === "tv"
    ? getPrevEpisode(season, episode, lookupCounts)
    : null;

  const goToEpisode = (pos: { season: number; episode: number }) => {
    const wallClock  = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
    const duration   = progressRef.current.duration;
    const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClock;
    const watched    = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
    if (watched > 10) persistRef.current(watched, duration);
    const seasonCount = pos.season === season
      ? episodeCount
      : episodeCounts.length >= pos.season
        ? episodeCounts[pos.season - 1]
        : seasonEpCountCache.get(`${tmdbId}-${pos.season}`) ?? null;
    const countParams = [
      seasonCount != null ? `&totalEps=${seasonCount}` : "",
      totalSeasons != null ? `&totalSeas=${totalSeasons}` : "",
    ].join("");
    navigate(`/watch/tv/${tmdbId}?title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&backdrop=${encodeURIComponent(backdrop)}&season=${pos.season}&episode=${pos.episode}${countParams}&progress=0${startOverSession ? "&startOver=1" : ""}`);
  };

  // Detect Android native player — on Android we skip the iframe entirely
  const isAndroid = typeof (window as any).AndroidPlayer !== "undefined";

  const providers        = getProviders(type, tmdbId, season, episode, startOverSession ? 0 : progressParam);
  const [providerIndex, setProviderIndex] = useState(0);
  const [src, setSrc]    = useState(() => providers[0].url);
  const providerSignalRef = useRef(false);

  useEffect(() => {
    const freshProviders = getProviders(type, tmdbId, season, episode, startOverSession ? 0 : progressParam);
    setProviderIndex(0);
    setSrc(freshProviders[0].url);
    providerSignalRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startFallbackTimer = useCallback(() => {
    // No fallback logic needed on Android — native PlayerActivity handles it
    if (isAndroid) return;
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
    }, 8_000);
  }, [isAndroid, providers]);

  useEffect(() => {
    startFallbackTimer();
    return () => { if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current); };
  }, [src, startFallbackTimer]);

  // ── Screen limit — block playback until this device owns a live slot ─────
  useEffect(() => {
    if (isAdmin) {
      setScreenGate("ok");
      return;
    }
    if (!user || !profile || !canWatch) return;
    let cancelled = false;
    setScreenGate("checking");
    setScreenError(null);

    const playingTitle = title || `Title ${tmdbId}`;
    const pingWatch = () => {
      if (!watchIdRef.current) return;
      pingScreenSlot(watchIdRef.current, {
        tmdbId,
        mediaType: type,
        title: playingTitle,
      }).catch(() => {});
    };
    (window as any).__ttflixPingWatch = pingWatch;

    (async () => {
      const slot = await claimScreenSlot({
        userId: user.id,
        plan: profile.plan,
        tmdbId,
        mediaType: type,
        title: playingTitle,
      });
      if (cancelled) return;
      if (!slot.ok) {
        setScreenError(screenLimitMessage(profile.plan, slot.max));
        setScreenGate("blocked");
        return;
      }
      watchIdRef.current = slot.id;
      setScreenGate("ok");
    })();

    const ping = setInterval(pingWatch, 3000);
    return () => {
      cancelled = true;
      clearInterval(ping);
      try { delete (window as any).__ttflixPingWatch; } catch { /* ignore */ }
      if (watchIdRef.current) {
        stopPlayingOnSlot(watchIdRef.current).catch(() => {});
      }
    };
  }, [user?.id, profile?.plan, isAdmin, canWatch]);

  useEffect(() => {
    if (screenGate !== "ok" || !watchIdRef.current) return;
    pingScreenSlot(watchIdRef.current, {
      tmdbId,
      mediaType: type,
      title: title || `Title ${tmdbId}`,
    }).catch(() => {});
  }, [tmdbId, type, title, season, episode, screenGate]);

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
    progressRef.current      = {
      watched: progressParam && progressParam > 0 ? progressParam : 0,
      duration: 0,
      hasPostMessage: !!(progressParam && progressParam > 0),
    };
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
    const existing = await supabase.from("watch_progress").select("watched_seconds, duration_seconds")
      .eq("user_id", user.id).eq("profile_id", effectiveProfile.id)
      .eq("tmdb_id", tmdbId).eq("media_type", type).maybeSingle();
    const resumeAt = progressParam && progressParam > 0 ? progressParam : 0;
    // Don't clobber a real Continue Watching row with a fake 10s marker.
    if (progressParam !== 0 && (existing.data?.watched_seconds ?? 0) >= 10 && resumeAt === 0) {
      savedInitial.current = true;
      if ((existing.data?.duration_seconds ?? 0) > 0 && progressRef.current.duration === 0) {
        progressRef.current.duration = existing.data!.duration_seconds;
      }
      return;
    }
    savedInitial.current = true;
    if (!durationReadyRef.current) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => { if (durationReadyRef.current) { clearInterval(check); resolve(); } }, 200);
        setTimeout(() => { clearInterval(check); resolve(); }, 6000);
      });
    }
    // User already jumped to another episode via Next — don't clobber it with S1E1.
    const nowEp = currentEpisodeRef.current;
    if (nowEp.season !== season || nowEp.episode !== episode) return;
    const duration = progressRef.current.duration;
    let safeDuration = duration > 0 ? Math.floor(duration) : 0;
    if (safeDuration === 0) {
      const { data: existing } = await supabase.from("watch_progress").select("duration_seconds")
        .eq("user_id", user.id).eq("profile_id", effectiveProfile.id)
        .eq("tmdb_id", tmdbId).eq("media_type", type).maybeSingle();
      safeDuration = existing?.duration_seconds ?? 0;
    }
    if (safeDuration > 0 && progressRef.current.duration === 0) progressRef.current.duration = safeDuration;
    const watchedStart = resumeAt > 0 ? Math.floor(resumeAt) : 10;
    await saveProgress({
      user_id: user.id, profile_id: effectiveProfile.id, tmdb_id: tmdbId, media_type: type,
      title, poster_path: poster || null, backdrop_path: backdrop || null,
      watched_seconds: watchedStart, duration_seconds: safeDuration,
      season: type === "tv" ? currentEpisodeRef.current.season : null,
      episode: type === "tv" ? currentEpisodeRef.current.episode : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop, progressParam]);

  // Dismiss loader:
  // - Android: dismiss quickly (500ms) — native PlayerActivity handles playback, no iframe signal needed
  // - Web: dismiss after 1s, or wait for kids check
  useEffect(() => {
    if (isAndroid) {
      const t = setTimeout(() => triggerExplosion(), 500);
      return () => clearTimeout(t);
    }
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
  }, [triggerExplosion, isKidsProfile, isAndroid, contentKey]);

  const persist = useCallback(async (watched: number, duration: number) => {
    if (!user || !effectiveProfile) return;
    if (kidsBlockedRef.current) return;
    let { season: currentSeason, episode: currentEp } = currentEpisodeRef.current;
    if (type === "tv" && (currentSeason < 1 || currentEp < 1)) return;
    if (type !== "tv" && watched < 10) return;
    let safeDuration = duration > 0 ? Math.floor(duration) : 0;
    const { data: existing } = await supabase.from("watch_progress")
      .select("watched_seconds, duration_seconds, season, episode")
      .eq("user_id", user.id).eq("profile_id", effectiveProfile.id)
      .eq("tmdb_id", tmdbId).eq("media_type", type).maybeSingle();
    if (safeDuration === 0) safeDuration = existing?.duration_seconds ?? 0;
    let savedWatched = safeDuration > 0 ? Math.min(Math.floor(watched), safeDuration) : Math.floor(watched);

    const sameEp = type !== "tv"
      || ((existing?.season ?? 1) === currentSeason && (existing?.episode ?? 1) === currentEp);
    // Don't let a 0/boot tick wipe a real resume point on the same episode.
    if (!startOverSession && sameEp && (existing?.watched_seconds ?? 0) > savedWatched && savedWatched < 15) {
      savedWatched = existing!.watched_seconds;
    }
    if (type === "tv" && savedWatched < 10 && !startOverSession) savedWatched = 10;

    // Finished this episode — land Continue Watching on the next one (Netflix-style).
    if (type === "tv" && isNearlyFinished(savedWatched, safeDuration)) {
      const counts = seasonCountsFor(currentSeason, episodeCount, episodeCounts);
      const next = getNextEpisode(currentSeason, currentEp, counts, totalSeasons);
      if (next) {
        currentEpisodeRef.current = next;
        currentSeason = next.season;
        currentEp = next.episode;
        savedWatched = 10;
        safeDuration = 0;
      }
    }

    await saveProgress({
      user_id: user.id, profile_id: effectiveProfile.id, tmdb_id: tmdbId, media_type: type,
      title: title || `Title ${tmdbId}`, poster_path: poster || null, backdrop_path: backdrop || null,
      watched_seconds: savedWatched,
      duration_seconds: safeDuration,
      season: type === "tv" ? currentSeason : null, episode: type === "tv" ? currentEp : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop, episodeCount, episodeCounts, totalSeasons, startOverSession]);

  const pullNativeProgress = useCallback(() => {
    if (!isAndroid) return;
    try {
      const raw = (window as any).AndroidPlayer?.getProgress?.();
      if (!raw) return;
      const p = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (p?.season > 0 && p?.episode > 0) {
        currentEpisodeRef.current = { season: p.season, episode: p.episode };
      }
      if (p?.watched > 0) {
        progressRef.current = {
          watched: p.watched,
          duration: p.duration > 0 ? p.duration : progressRef.current.duration,
          hasPostMessage: true,
        };
      }
    } catch { /* ignore */ }
  }, [isAndroid]);

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
    // Android uses native PlayerActivity — no iframe to manage
    if (isAndroid) return;
    const iframe = iframeRef.current;
    if (!iframe || kidsBlockedRef.current) return;
    progressRef.current.hasPostMessage = false;
    playerStartedRef.current = false;
    iframe.src = "about:blank";
    const t = setTimeout(() => { if (iframeRef.current) iframeRef.current.src = src; }, 50);
    return () => clearTimeout(t);
  }, [src, isAndroid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Progress save interval + beforeunload ─────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      pullNativeProgress();
      const wallClock = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration  = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClock;
      const watched   = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (type === "tv" || watched > 10) persistRef.current(watched, duration);
    }, 15_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tmdbId]);

  useEffect(() => {
    const save = () => {
      pullNativeProgress();
      const wallClock  = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration   = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClock;
      const watched    = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (user && (type === "tv" || watched > 10)) persistRef.current(watched, duration);
    };
    window.addEventListener("beforeunload", save);
    return () => { save(); window.removeEventListener("beforeunload", save); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Android native player ─────────────────────────────────────────────────
  const playerLaunchedRef = useRef(false);
  useEffect(() => { playerLaunchedRef.current = false; }, [contentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tvWaitTimedOut, setTvWaitTimedOut] = useState(false);
  useEffect(() => {
    setTvWaitTimedOut(false);
    if (type !== "tv") return;
    const t = setTimeout(() => setTvWaitTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [contentKey, type]);

  const tvCountsReady = type !== "tv" || episodeCount != null || episodeCounts.length > 0 || tvWaitTimedOut;

  useEffect(() => {
    if (stillLoading || !canWatch || screenGate !== "ok" || !!screenError) return;
    if (!tvCountsReady) return;
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
        const playProgress = startOverSession
          ? 0
          : (progressParam && progressParam > 0 ? progressParam : undefined);
        const primaryUrl = getProviders(type, tmdbId, season, episode, playProgress)[0].url;
        const android = (window as any).AndroidPlayer;
        const counts = seasonCountsFor(season, episodeCount, episodeCounts);
        const countsStr = counts.length > 0 ? counts.join(",") : String(episodeCount ?? 0);
        const nextUrl = nextEp
          ? getProviders(type, tmdbId, nextEp.season, nextEp.episode, startOverSession ? 0 : undefined)[0]?.url
          : "";
        if (android?.openWithNextEx) {
          android.openWithNextEx(primaryUrl, nextUrl ?? "", episodeCount ?? 0, totalSeasons ?? 0, countsStr, startOverSession, String(tmdbId));
          return;
        }
        if (android?.openWithNext && nextUrl) {
          android.openWithNext(primaryUrl, nextUrl, episodeCount ?? 0, totalSeasons ?? 0, countsStr);
          return;
        }
        if (android?.openWithNext && type === "tv") {
          android.openWithNext(primaryUrl, "", episodeCount ?? 0, totalSeasons ?? 0, countsStr);
          return;
        }
        android?.open(primaryUrl);
      }, 100);
    }
    launch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillLoading, canWatch, screenError, screenGate, tvCountsReady, episodeCount, episodeCounts, totalSeasons, nextEp]);

  useEffect(() => {
    if (!isAndroid || type !== "tv") return;
    const counts = seasonCountsFor(season, episodeCount, episodeCounts);
    if (counts.length === 0) return;
    (window as any).AndroidPlayer?.setSeasonCounts?.(counts.join(","), totalSeasons ?? 0);
  }, [isAndroid, type, season, episodeCount, episodeCounts, totalSeasons]);

  useEffect(() => {
    const onResume = async (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      if (detail.season > 0 && detail.episode > 0) {
        currentEpisodeRef.current = { season: detail.season, episode: detail.episode };
      }
      pullNativeProgress();
      const wallClock  = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration   = detail.duration > 0 ? detail.duration : progressRef.current.duration;
      const nativeWatched = detail.watched > 0 ? detail.watched : 0;
      const refWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : 0;
      const rawWatched = Math.max(
        nativeWatched,
        refWatched,
        nativeWatched < 10 && refWatched < 10 ? wallClock : 0,
      );
      const watched    = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (user) await persistRef.current(watched, duration);
      if (window.history.length > 1) navigate(-1);
      else navigate("/");
    };
    window.addEventListener("androidresume", onResume);
    return () => window.removeEventListener("androidresume", onResume);
  }, [navigate, user, pullNativeProgress]);

  // When native Next button is tapped, advance episode tracking and push next URL back
  useEffect(() => {
    const onNext = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      pullNativeProgress();
      const duration   = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : 0;
      const watched    = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (watched > 10) persistRef.current(watched, duration);

      if (detail.season > 0 && detail.episode > 0) {
        currentEpisodeRef.current = { season: detail.season, episode: detail.episode };
      } else {
        const cur = currentEpisodeRef.current;
        const counts = seasonCountsFor(cur.season, episodeCount, episodeCounts);
        const newEp = getNextEpisode(cur.season, cur.episode, counts, totalSeasons);
        if (!newEp) {
          (window as any).AndroidPlayer?.setSeasonCounts?.(counts.join(","), totalSeasons ?? 0);
          return;
        }
        currentEpisodeRef.current = newEp;
      }

      progressRef.current  = { watched: 0, duration: 0, hasPostMessage: false };
      watchStartRef.current = Date.now();
      savedInitial.current  = false;
      persistRef.current(10, 0);
    };
    window.addEventListener("androidNextEpisode", onNext);
    return () => window.removeEventListener("androidNextEpisode", onNext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, type, tmdbId, episodeCount, episodeCounts, totalSeasons, pullNativeProgress]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "GoBack" || e.key === "Back" || e.key === "BrowserBack" || e.key === "Escape") {
        e.preventDefault();
        exitToPreview();
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const onExit = !!active?.hasAttribute("data-tv-exit");
      const onPlayerControl = !!active?.closest("[data-tv-player]") && !onExit;

      // Leave the X so the next OK / Enter plays instead of exiting.
      if (onExit && arrowDir(e)) {
        e.preventDefault();
        e.stopPropagation();
        leaveExitButton();
        return;
      }

      // Centre button (OK/Select on TV remote) or dedicated media key → play/pause
      // Only fire when focus is not on one of the overlay control buttons (those handle Enter themselves)
      if (
        !onPlayerControl &&
        !onExit &&
        (isTvActivateKey(e) || e.key === "MediaPlayPause" || e.key === "MediaPlay" || e.key === "MediaPause" ||
         e.key === "Enter" || e.key === " ")
      ) {
        e.preventDefault();
        iframeRef.current?.contentWindow?.postMessage({ type: "togglePlay" }, "*");
        showExit();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [exitToPreview, leaveExitButton, showExit]);

  useEffect(() => {
    if (kidsBlocked || isAndroid) return;
    const id = window.setTimeout(() => {
      if (isTvDevice()) focusExitButton();
    }, 80);
    return () => window.clearTimeout(id);
  }, [kidsBlocked, isAndroid, contentKey, focusExitButton]);

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
      {(profile?.plan === "basic" || profile?.plan === "basic_annual") && (
        <button onClick={() => navigate("/account")} className="rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white/80">Upgrade Plan</button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black" onMouseMove={showExit} onTouchStart={showExit}>
      <TTFlixLoader key={loaderKey} explode={explodeLoader} persistent={!isAndroid} backdrop={backdrop || poster} onDone={onLoaderDone} />

      {/* iframe — web only; Android uses native PlayerActivity instead */}
      {!kidsBlocked && !isAndroid && screenGate === "ok" && (
        <iframe ref={iframeRef} src={src}
          tabIndex={-1}
          className="absolute inset-0 h-full w-full border-0 z-10"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen title={title || "TTFlix Player"} />
      )}

      {/* Transparent tap-catcher above the iframe — triggers controls visibility on mobile tap.
          pointer-events-none after controls are visible so taps reach the iframe normally.
          Web only — Android has its own touch handling in PlayerActivity. */}
      {!kidsBlocked && !isAndroid && !exitVisible && (
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

      {/* Exit button — web/TV only. Android uses the native PlayerActivity X. */}
      {/* data-tv-player marks this zone so navigateVertical skips these buttons */}
      {!kidsBlocked && !isAndroid && (
        <div data-tv-player>
          <button
            data-tv-exit
            data-tv-chrome
            onTouchStart={(e) => { e.stopPropagation(); exitToPreview(); }}
            onClick={exitToPreview}
            tabIndex={0}
            aria-label="Back to preview"
            onFocus={showExit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); exitToPreview(); }
              if (arrowDir(e)) {
                e.preventDefault();
                (e.currentTarget as HTMLElement).blur();
              }
            }}
            className="absolute left-4 top-4 z-[90] flex h-10 w-10 items-center justify-center rounded-md bg-white text-black shadow-lg transition hover:bg-white/90 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
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
                          onFocus={showExit}
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
                    data-tv-chrome
                    tabIndex={0}
                    aria-label="Season picker"
                    aria-expanded={showSeasonPicker}
                    onFocus={showExit}
                    onClick={() => setShowSeasonPicker((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowSeasonPicker((v) => !v); }
                      if (e.key === "Escape") { e.preventDefault(); setShowSeasonPicker(false); }
                      // ArrowLeft moves back to the exit button
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        const playerZone = (e.currentTarget as HTMLElement).closest("[data-tv-player]");
                        const btns = playerZone
                          ? Array.from(playerZone.querySelectorAll<HTMLElement>("button:not([disabled])"))
                          : [];
                        const idx = btns.indexOf(e.currentTarget as HTMLElement);
                        if (idx > 0) btns[idx - 1].focus();
                      }
                      if (e.key === "ArrowRight") {
                        e.preventDefault();
                        const playerZone = (e.currentTarget as HTMLElement).closest("[data-tv-player]");
                        const btns = playerZone
                          ? Array.from(playerZone.querySelectorAll<HTMLElement>("button:not([disabled])"))
                          : [];
                        const idx = btns.indexOf(e.currentTarget as HTMLElement);
                        if (idx >= 0 && idx < btns.length - 1) btns[idx + 1].focus();
                      }
                    }}
                    className="flex items-center gap-2 rounded-full border-2 border-white/50 bg-black/80 px-5 py-3 text-sm font-bold text-white transition
                      hover:bg-white hover:text-black hover:border-white
                      focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"
                  >
                    Season {season}
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showSeasonPicker ? "rotate-180" : ""}`} />
                  </button>
                </div>

              {prevEp && (
                <button
                  data-tv-chrome
                  onTouchStart={(e) => { e.stopPropagation(); goToEpisode(prevEp); }}
                  onClick={() => goToEpisode(prevEp)}
                  tabIndex={0}
                  aria-label={`Previous episode ${prevEp.episode}`}
                  onFocus={showExit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToEpisode(prevEp); }
                    if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      const playerZone = (e.currentTarget as HTMLElement).closest("[data-tv-player]");
                      const btns = playerZone
                        ? Array.from(playerZone.querySelectorAll<HTMLElement>("button:not([disabled])"))
                        : [];
                      const idx = btns.indexOf(e.currentTarget as HTMLElement);
                      if (idx > 0) btns[idx - 1].focus();
                    }
                    if (e.key === "ArrowRight") {
                      e.preventDefault();
                      const playerZone = (e.currentTarget as HTMLElement).closest("[data-tv-player]");
                      const btns = playerZone
                        ? Array.from(playerZone.querySelectorAll<HTMLElement>("button:not([disabled])"))
                        : [];
                      const idx = btns.indexOf(e.currentTarget as HTMLElement);
                      if (idx >= 0 && idx < btns.length - 1) btns[idx + 1].focus();
                    }
                  }}
                  className="flex items-center gap-2 rounded-full border-2 border-white/50 bg-black/80 px-5 py-3 text-sm font-bold text-white transition
                    hover:bg-white hover:text-black hover:border-white active:bg-white active:text-black active:border-white
                    focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"
                  style={{ WebkitTapHighlightColor: "rgba(255,255,255,0.3)" }}
                >
                  <SkipBack className="h-5 w-5 shrink-0" />
                  prev ep.{prevEp.episode}
                </button>
              )}
              {nextEp && (
                <button
                  data-tv-chrome
                  onTouchStart={(e) => { e.stopPropagation(); goToEpisode(nextEp); }}
                  onClick={() => goToEpisode(nextEp)}
                  tabIndex={0}
                  aria-label={`Next episode ${nextEp.episode}`}
                  onFocus={showExit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToEpisode(nextEp); }
                    if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      const playerZone = (e.currentTarget as HTMLElement).closest("[data-tv-player]");
                      const btns = playerZone
                        ? Array.from(playerZone.querySelectorAll<HTMLElement>("button:not([disabled])"))
                        : [];
                      const idx = btns.indexOf(e.currentTarget as HTMLElement);
                      if (idx > 0) btns[idx - 1].focus();
                    }
                  }}
                  className="flex items-center gap-2 rounded-full border-2 border-white/50 bg-black/80 px-5 py-3 text-sm font-bold text-white transition
                    hover:bg-white hover:text-black hover:border-white active:bg-white active:text-black active:border-white
                    focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"
                  style={{ WebkitTapHighlightColor: "rgba(255,255,255,0.3)" }}
                >
                  <SkipForward className="h-5 w-5 shrink-0" />
                  next ep.{nextEp.episode}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
