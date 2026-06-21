import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
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
      const staleDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
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
    }, 30_000);
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

  const triggerExplosion = useCallback(() => setExplodeLoader(true), []);
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
        }
        if (d?.timestamp !== undefined && d?.duration !== undefined) {
          const newDuration = d.duration > 0 ? d.duration : progressRef.current.duration;
          progressRef.current = { watched: d.timestamp, duration: newDuration, hasPostMessage: true };
          providerSignalRef.current = true;
          lastHeartbeatRef.current = Date.now(); // keep watchdog alive
          if (!playerStartedRef.current) {
            playerStartedRef.current = true;
            lastHeartbeatRef.current = Date.now();
            triggerExplosion();
            saveInitial();
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

  // ── Crash watchdog ───────────────────────────────────────────────────────────
  // Once Videasy fires its first postMessage (player started), track a heartbeat.
  // Every time a postMessage comes in, update lastHeartbeatRef.
  // If 10s pass with no heartbeat after the player started → reload.
  const lastHeartbeatRef = useRef<number>(0);

  useEffect(() => {
    const t = setInterval(() => {
      // Only watch after player has actually started sending messages
      if (!playerStartedRef.current) return;
      if (lastHeartbeatRef.current === 0) return;
      if (document.visibilityState === "hidden") return;
      const elapsed = Date.now() - lastHeartbeatRef.current;
      if (elapsed > 10_000) {
        window.location.reload();
      }
    }, 5_000);
    return () => clearInterval(t);
  }, []);

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
        const fallbackUrl = providers[1]?.url ?? null;
        const androidPlayer = (window as any).AndroidPlayer;
        if (fallbackUrl) {
          androidPlayer?.openWithFallback(primaryUrl, fallbackUrl);
        } else {
          androidPlayer?.open(primaryUrl);
        }
      }, 500);
    }

    launch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillLoading, canWatch, screenError]);

  // When PlayerActivity closes (androidresume fires), save progress then go home
  useEffect(() => {
    const onResume = () => {
      // Save current progress before navigating away
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
    <div className="fixed inset-0 bg-black">
      <TTFlixLoader
        key={loaderKey}
        explode={false}
        persistent={true}
        backdrop={backdrop || poster}
        onDone={() => {}}
      />

      {/* Kids blocked — shown on top of loader after check completes */}
      {kidsBlocked && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="text-6xl">🔒</div>
          <h2 className="text-xl font-bold text-white">Not Available for Kids</h2>
          <p className="text-sm text-white/70 max-w-xs">
            This title is rated <span className="font-bold text-primary">{kidsBlockedRating}</span> and cannot be played on a Kids profile.
          </p>
          <button onClick={() => navigate("/")} className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white">Go Back</button>
        </div>
      )}
    </div>
  );
}
