import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { X, SkipForward } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { getProviders, type Provider } from "@/lib/stream";
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

  const title = searchParams.get("title") ?? "";
  const poster = searchParams.get("poster") ?? "";
  const backdrop = searchParams.get("backdrop") ?? "";
  const season = Number(searchParams.get("season") ?? 1);
  const episode = Number(searchParams.get("episode") ?? 1);
  const startOver = searchParams.get("startOver") === "1";

  const type = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);
  const stillLoading = loading || profileLoading;
  const canWatch = isAdmin || (!!user && profile?.status === "approved");
  const isKidsProfile = activeProfile?.is_kids ?? false;

  const KIDS_BLOCKED_RATINGS = new Set(["PG-13", "R", "NC-17", "TV-14", "TV-MA", "18+", "18", "X"]);
  const [kidsBlocked, setKidsBlocked] = useState(false);
  const kidsBlockedRef = useRef(false);
  const [kidsBlockedRating, setKidsBlockedRating] = useState<string | null>(null);
  const kidsCheckDoneRef = useRef(!isKidsProfile);

  useEffect(() => {
    if (!isKidsProfile) { kidsCheckDoneRef.current = true; kidsBlockedRef.current = false; return; }
    kidsCheckDoneRef.current = false;
    kidsBlockedRef.current = false;
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

  const providers = getProviders(type, tmdbId, season, episode);
  const [providerIndex, setProviderIndex] = useState(0);
  const [src, setSrc] = useState(() => providers[0].url);
  const providerSignalRef = useRef(false);

  // ── Next episode state ──────────────────────────────────────────────────────
  const [nextEp, setNextEp] = useState<{ season: number; episode: number; name: string } | null>(null);
  const [showNextBanner, setShowNextBanner] = useState(false);
  const nextBannerShownRef = useRef(false);
  const totalSeasonsRef = useRef<number>(1);
  const episodeListRef = useRef<{ episode_number: number; name: string }[]>([]);

  // Fetch episode list whenever season changes so we know the last episode number
  useEffect(() => {
    if (type !== "tv") return;
    setNextEp(null);
    setShowNextBanner(false);
    nextBannerShownRef.current = false;
    episodeListRef.current = [];

    getDetails({ data: { id: tmdbId, mediaType: "tv" } }).then((d) => {
      totalSeasonsRef.current = d.number_of_seasons ?? 1;
    }).catch(() => {});

    getSeasonEpisodes({ data: { id: tmdbId, season: currentEpisodeRef.current.season } })
      .then((eps: { episode_number: number; name: string }[]) => {
        episodeListRef.current = eps;
        computeNextEp();
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, type]);

  const computeNextEp = useCallback(() => {
    const { season: curS, episode: curEp } = currentEpisodeRef.current;
    const eps = episodeListRef.current;
    if (!eps.length) return;
    const nextInSeason = eps.find((e) => e.episode_number === curEp + 1);
    if (nextInSeason) {
      setNextEp({ season: curS, episode: nextInSeason.episode_number, name: nextInSeason.name });
    } else if (curS < totalSeasonsRef.current) {
      // Last episode of season — next is S+1 E1
      setNextEp({ season: curS + 1, episode: 1, name: `Season ${curS + 1} Episode 1` });
    } else {
      setNextEp(null); // last episode of series
    }
  }, []);

  const goNextEpisode = useCallback(() => {
    if (!nextEp) return;
    const wallClockWatched = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
    const duration = progressRef.current.duration;
    const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClockWatched;
    const watched = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
    if (user && watched > 10) persistRef.current(watched, duration);
    navigate(
      `/watch/${type}/${tmdbId}?title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&backdrop=${encodeURIComponent(backdrop)}&season=${nextEp.season}&episode=${nextEp.episode}&startOver=1`
    );
  }, [nextEp, navigate, type, tmdbId, title, poster, backdrop, user]);

  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    providerSignalRef.current = false;
    fallbackTimerRef.current = setTimeout(() => {
      if (!providerSignalRef.current) {
        setProviderIndex((prev) => {
          const next = prev + 1;
          if (next < providers.length) {
            setSrc(providers[next].url);
            return next;
          }
          return prev;
        });
      }
    }, 15_000);
  }, [providers]);

  useEffect(() => {
    startFallbackTimer();
    return () => { if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current); };
  }, [src, startFallbackTimer]);

  // ── Screen limit check ──────────────────────────────────────────────────────
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
        const planName = PLANS[profile!.plan]?.name ?? profile!.plan;
        const upgradeMsg = (profile!.plan === "basic" || profile!.plan === "basic_annual")
          ? " Upgrade to Premium for up to 5 screens."
          : "";
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

  const durationReadyRef = useRef(false);
  useEffect(() => {
    durationReadyRef.current = false;
    progressRef.current = { watched: 0, duration: 0, hasPostMessage: false };
    watchStartRef.current = Date.now();
    savedInitial.current = false;
    playerStartedRef.current = false;

    async function fetchDuration() {
      try {
        const details = await getDetails({ data: { id: tmdbId, mediaType: type } });
        let runtimeMins = details.runtime;
        if (!runtimeMins && type === "tv") {
          try {
            const episodes = await getSeasonEpisodes({ data: { id: tmdbId, season } });
            const ep = episodes.find((e: { episode_number: number; runtime?: number | null }) => e.episode_number === episode);
            runtimeMins = ep?.runtime ?? episodes[0]?.runtime ?? null;
          } catch { /* ignore */ }
        }
        if (runtimeMins && runtimeMins > 0) progressRef.current.duration = runtimeMins * 60;
      } catch { /* ignore */ }
      durationReadyRef.current = true;
    }
    fetchDuration();
  }, [tmdbId, type, season, episode]);

  const triggerExplosion = useCallback(() => {
    setExplodeLoader(true);
  }, []);
  const onLoaderDone = useCallback(() => setLoaderVisible(false), []);
  const savedInitial = useRef(false);

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
      season: type === "tv" ? season : null, episode: type === "tv" ? episode : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop, season, episode]);

  // Dismiss loader after 1s — but wait for kids check first if on a kids profile
  useEffect(() => {
    if (!isKidsProfile) {
      const t = setTimeout(() => triggerExplosion(), 1000);
      return () => clearTimeout(t);
    }
    // On kids profile: wait for check to complete then either block or dismiss
    const t = setTimeout(() => {
      // If check is done, fire immediately; otherwise poll until it is
      if (kidsCheckDoneRef.current) {
        triggerExplosion();
        return;
      }
      const poll = setInterval(() => {
        if (kidsCheckDoneRef.current) {
          clearInterval(poll);
          triggerExplosion();
        }
      }, 100);
      // Hard cap at 6s total
      setTimeout(() => { clearInterval(poll); triggerExplosion(); }, 6000);
    }, 1000); // give the API 1s head start before we start polling
    return () => clearTimeout(t);
  }, [triggerExplosion, isKidsProfile]);

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

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;

        // Videasy "not found" — immediately switch to VidSrc fallback
        if (d?.type === "notFound" || d?.event === "notFound" ||
            d?.type === "error" || d?.event === "error") {
          const next = providerIndex + 1;
          if (next < providers.length) {
            setProviderIndex(next);
            setSrc(providers[next].url);
          }
          return;
        }

        if (d?.type === "ready" || d?.event === "ready") { providerSignalRef.current = true; triggerExplosion(); saveInitial(); }
        if (d?.type === "episodeChange" || d?.event === "episodeChange") {
          if (d?.season) currentEpisodeRef.current.season = Number(d.season);
          if (d?.episode) currentEpisodeRef.current.episode = Number(d.episode);
          progressRef.current = { watched: 0, duration: 0, hasPostMessage: false };
          savedInitial.current = false;
          setShowNextBanner(false);
          nextBannerShownRef.current = false;
          // Re-fetch episode list for the new season if it changed
          if (d?.season) {
            getSeasonEpisodes({ data: { id: tmdbId, season: Number(d.season) } })
              .then((eps: { episode_number: number; name: string }[]) => {
                episodeListRef.current = eps;
                computeNextEp();
              }).catch(() => {});
          } else {
            computeNextEp();
          }
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
          // Show "Up Next" banner in the last 60s or last 8% of the episode
          if (type === "tv" && nextEp && !nextBannerShownRef.current && newDuration > 0) {
            const remaining = newDuration - d.timestamp;
            const pct = d.timestamp / newDuration;
            if (remaining <= 60 || pct >= 0.92) {
              nextBannerShownRef.current = true;
              setShowNextBanner(true);
            }
          }
        }
      } catch { }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [triggerExplosion, saveInitial, providerIndex, providers]);

  // When src changes, force iframe reload — skip if kids blocked
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (kidsBlockedRef.current) return; // never load blocked content
    progressRef.current.hasPostMessage = false;
    playerStartedRef.current = false;
    lastHeartbeatRef.current = 0;
    iframe.src = "about:blank";
    const t = setTimeout(() => { if (iframeRef.current) iframeRef.current.src = src; }, 50);
    return () => clearTimeout(t);
  }, [src]);

  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; }, [persist]);

  // ── Crash watchdog REMOVED ─────────────────────────────────────────────────
  // The watchdog was calling window.location.reload() on any brief pause in
  // postMessages (e.g. user clicking play on the Videasy UI), causing the
  // "acts weird and reloads" bug. Progress is saved on interval + beforeunload
  // which is sufficient.

  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      const wallClockWatched = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClockWatched;
      const watched = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (watched > 10) persistRef.current(watched, duration);
    }, 15_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tmdbId]);

  useEffect(() => {
    const save = () => {
      const wallClockWatched = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClockWatched;
      const watched = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (user && watched > 10) persistRef.current(watched, duration);
    };
    window.addEventListener("beforeunload", save);
    return () => { save(); window.removeEventListener("beforeunload", save); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Launch PlayerActivity — wait for kids check to complete first
  const playerLaunchedRef = useRef(false);
  useEffect(() => {
    playerLaunchedRef.current = false;
  }, [tmdbId, season, episode]);

  useEffect(() => {
    if (stillLoading || !canWatch || !!screenError) return;
    if (playerLaunchedRef.current) return;

    // Wait for kids check before launching — prevents bypassing child lock
    async function launch() {
      if (!kidsCheckDoneRef.current) {
        await new Promise<void>((resolve) => {
          const poll = setInterval(() => {
            if (kidsCheckDoneRef.current) { clearInterval(poll); resolve(); }
          }, 50);
          setTimeout(() => { clearInterval(poll); resolve(); }, 5000);
        });
      }
      // Re-check after waiting — may have become blocked
      if (kidsBlockedRef.current) return;
      if (playerLaunchedRef.current) return;
      playerLaunchedRef.current = true;
      saveInitial();
      setTimeout(() => {
        const primaryUrl = providers[0].url;
        const androidPlayer = (window as any).AndroidPlayer;
        androidPlayer?.open(primaryUrl);
      }, 500);
    }

    launch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillLoading, canWatch, screenError]);

  // When PlayerActivity closes (androidresume fires), save progress then go home
  useEffect(() => {
    const onResume = () => {
      const wallClockWatched = watchStartRef.current > 0 ? Math.floor((Date.now() - watchStartRef.current) / 1000) : 0;
      const duration = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage ? progressRef.current.watched : wallClockWatched;
      const watched = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (user && watched > 10) persistRef.current(watched, duration);
      navigate("/");
    };
    window.addEventListener("androidresume", onResume);
    return () => window.removeEventListener("androidresume", onResume);
  }, [navigate, user]);

  // TV remote Back / GoBack key — exit player
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "GoBack" || e.key === "Back" || e.key === "BrowserBack") {
        e.preventDefault();
        navigate("/");
      }
      // If Up Next banner is visible, Arrow keys should not escape to the iframe
      if (showNextBanner && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, showNextBanner]);

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
    <div
      className="fixed inset-0 bg-black"
      onMouseMove={showExit}
      onTouchStart={showExit}
    >
      {/* ── Loader overlay ── */}
      <TTFlixLoader
        key={loaderKey}
        explode={explodeLoader}
        persistent={true}
        backdrop={backdrop || poster}
        onDone={onLoaderDone}
      />

      {/* ── Iframe player (web) — rendered under loader, always present ── */}
      {!kidsBlocked && (
        <iframe
          ref={iframeRef}
          src={src}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          title={title || "TTFlix Player"}
        />
      )}

      {/* ── Kids blocked ── */}
      {kidsBlocked && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="text-6xl">🔒</div>
          <h2 className="text-xl font-bold text-white">Not Available for Kids</h2>
          <p className="text-sm text-white/70 max-w-xs">
            This title is rated <span className="font-bold text-primary">{kidsBlockedRating}</span> and cannot be played on a Kids profile.
          </p>
          <button
            autoFocus
            onClick={() => navigate("/")}
            className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Go Back
          </button>
        </div>
      )}

      {/* ── Overlay controls (shown once loader clears) ── */}
      {!loaderVisible && !kidsBlocked && (
        <>
          {/* TOP-LEFT: Exit */}
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

          {/* BOTTOM-RIGHT: Next Episode (TV only) */}
          {type === "tv" && nextEp && (
            <button
              onClick={goNextEpisode}
              tabIndex={0}
              data-tv-card
              aria-label={`Next episode S${nextEp.season} E${nextEp.episode}`}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goNextEpisode(); } }}
              className={`absolute bottom-6 right-4 z-40 flex items-center gap-2 rounded-full border-2 border-white/40 bg-black/80 px-5 py-3 text-sm font-bold text-white backdrop-blur-sm transition
                hover:border-white hover:bg-white hover:text-black
                focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black
                ${exitVisible ? "opacity-100" : "opacity-20"}`}
            >
              <SkipForward className="h-5 w-5 shrink-0" />
              Next Episode
            </button>
          )}

          {/* TOP-RIGHT: Up Next banner (near end of episode) */}
          {showNextBanner && nextEp && (
            <div
              role="dialog"
              aria-label="Up next episode"
              className="absolute right-4 top-4 z-40 w-64 rounded-xl border border-white/20 bg-black/90 p-4 shadow-2xl backdrop-blur-md sm:w-72"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Up Next</p>
              <p className="text-sm font-bold text-white leading-tight line-clamp-2 mb-3">
                S{nextEp.season} E{nextEp.episode} · {nextEp.name}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={goNextEpisode}
                  tabIndex={0}
                  data-tv-card
                  autoFocus
                  aria-label="Play next episode"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goNextEpisode(); }
                    if (e.key === "ArrowRight") { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLElement)?.focus(); }
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition
                    hover:bg-primary/85
                    focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-black"
                >
                  <SkipForward className="h-4 w-4 shrink-0" /> Play
                </button>
                <button
                  onClick={() => { setShowNextBanner(false); nextBannerShownRef.current = true; }}
                  tabIndex={0}
                  data-tv-card
                  aria-label="Dismiss"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowNextBanner(false); nextBannerShownRef.current = true; }
                    if (e.key === "ArrowLeft") { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLElement)?.focus(); }
                  }}
                  className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white/70 transition
                    hover:bg-white/10
                    focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-black"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
