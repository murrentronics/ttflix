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

  const type = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);
  const stillLoading = loading || profileLoading;
  const canWatch = isAdmin || (!!user && profile?.status === "approved");
  const isKidsProfile = (activeProfile?.is_kids ?? false) && !isAdmin;

  // Kids cert check — fetch details to get certification, block explicit ratings
  const KIDS_BLOCKED_RATINGS = new Set(["PG-13", "R", "NC-17", "TV-14", "TV-MA", "18+", "18", "X"]);
  const [kidsBlocked, setKidsBlocked] = useState(false);
  const [kidsBlockedRating, setKidsBlockedRating] = useState<string | null>(null);

  useEffect(() => {
    if (!isKidsProfile) return;
    getDetails({ data: { id: tmdbId, mediaType: type } }).then((details) => {
      const cert = details.certification?.toUpperCase() ?? null;
      if (cert && KIDS_BLOCKED_RATINGS.has(cert)) {
        setKidsBlocked(true);
        setKidsBlockedRating(cert);
      }
    }).catch(() => {});
  }, [tmdbId, type, isKidsProfile]);

  const currentEpisodeRef = useRef({ season, episode });

  const providers = getProviders(type, tmdbId, season, episode);
  const [providerIndex, setProviderIndex] = useState(0);
  const [src, setSrc] = useState(() => providers[0].url);
  const providerSignalRef = useRef(false); // did current provider fire a ready/progress signal?

  // Fallback: if provider fires no signal after 35s, try the next one
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
          return prev; // exhausted all providers
        });
      }
    }, 35_000);
  }, [providers]);

  // Start fallback timer whenever src changes
  useEffect(() => {
    startFallbackTimer();
    return () => { if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current); };
  }, [src, startFallbackTimer]);

  // ── Screen limit check + register active watch ──────────────────────────────
  useEffect(() => {
    if (!user || !session || !profile || isAdmin) return;

    const sessionId = session.access_token;
    const max = PLANS[profile.plan]?.screens ?? 2;

    async function registerWatch() {
      const staleDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await supabase
        .from("active_watches")
        .delete()
        .eq("user_id", user!.id)
        .lt("last_ping", staleDate);

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

    const ping = setInterval(() => {
      if (watchIdRef.current) {
        supabase
          .from("active_watches")
          .update({ last_ping: new Date().toISOString() })
          .eq("id", watchIdRef.current);
      }
    }, 30_000);

    return () => {
      clearInterval(ping);
      if (watchIdRef.current) {
        supabase.from("active_watches").delete().eq("id", watchIdRef.current);
      }
    };
  }, [user, session, profile, isAdmin, tmdbId, type, title, season, episode]);

  // Fetch runtime from TMDB — populate duration before anything is saved
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

        if (runtimeMins && runtimeMins > 0) {
          progressRef.current.duration = runtimeMins * 60;
        }
      } catch { /* ignore */ }
      durationReadyRef.current = true;
    }

    fetchDuration();
  }, [tmdbId, type, season, episode]);

  const triggerExplosion = useCallback(() => setExplodeLoader(true), []);
  const onLoaderDone = useCallback(() => setLoaderVisible(false), []);

  const savedInitial = useRef(false);

  const saveInitial = useCallback(async () => {
    if (savedInitial.current) return;
    if (!user || !effectiveProfile || !title) return;
    if (kidsBlocked) return; // never save blocked content
    savedInitial.current = true;

    // Wait up to 6s for duration to be fetched from TMDB
    if (!durationReadyRef.current) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (durationReadyRef.current) { clearInterval(check); resolve(); }
        }, 200);
        setTimeout(() => { clearInterval(check); resolve(); }, 6000);
      });
    }

    const duration = progressRef.current.duration;

    // If we still have no duration, try to pull from DB (existing record)
    let safeDuration = duration > 0 ? Math.floor(duration) : 0;
    if (safeDuration === 0) {
      const { data: existing } = await supabase
        .from("watch_progress")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .eq("profile_id", effectiveProfile.id)
        .eq("tmdb_id", tmdbId)
        .eq("media_type", type)
        .maybeSingle();
      safeDuration = existing?.duration_seconds ?? 0;
    }

    // Also write it back to progressRef so persist() uses it
    if (safeDuration > 0 && progressRef.current.duration === 0) {
      progressRef.current.duration = safeDuration;
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
      duration_seconds: safeDuration,
      season: type === "tv" ? season : null,
      episode: type === "tv" ? episode : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop, season, episode]);

  // Dismiss loader after 3s — but do NOT save progress until player signals it's actually playing
  useEffect(() => {
    const t = setTimeout(() => { triggerExplosion(); }, 3000);
    return () => clearTimeout(t);
  }, [triggerExplosion]);

  const persist = useCallback(async (watched: number, duration: number) => {
    if (!user || !effectiveProfile || watched < 10) return;
    if (kidsBlocked) return; // never save blocked content
    const { season: currentSeason, episode: currentEp } = currentEpisodeRef.current;
    // Preserve existing duration in DB if we don't have one
    let safeDuration = duration > 0 ? Math.floor(duration) : 0;
    if (safeDuration === 0) {
      const { data: existing } = await supabase
        .from("watch_progress")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .eq("profile_id", effectiveProfile.id)
        .eq("tmdb_id", tmdbId)
        .eq("media_type", type)
        .maybeSingle();
      safeDuration = existing?.duration_seconds ?? 0;
    }
    await saveProgress({
      user_id: user.id,
      profile_id: effectiveProfile.id,
      tmdb_id: tmdbId,
      media_type: type,
      title: title || `Title ${tmdbId}`,
      poster_path: poster || null,
      backdrop_path: backdrop || null,
      watched_seconds: safeDuration > 0 ? Math.min(Math.floor(watched), safeDuration) : Math.floor(watched),
      duration_seconds: safeDuration,
      season: type === "tv" ? currentSeason : null,
      episode: type === "tv" ? currentEp : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d && typeof d === "object") console.log("[videasy msg]", JSON.stringify(d));
        if (d?.type === "ready" || d?.event === "ready") { providerSignalRef.current = true; triggerExplosion(); saveInitial(); }
        if (d?.type === "episodeChange" || d?.event === "episodeChange") {
          if (d?.season) currentEpisodeRef.current.season = Number(d.season);
          if (d?.episode) currentEpisodeRef.current.episode = Number(d.episode);
          progressRef.current = { watched: 0, duration: 0, hasPostMessage: false };
          savedInitial.current = false;
        }
        if (d?.timestamp !== undefined && d?.duration !== undefined) {
          // Never overwrite a known duration with 0 — Videasy often sends duration: 0
          const newDuration = d.duration > 0 ? d.duration : progressRef.current.duration;
          progressRef.current = { watched: d.timestamp, duration: newDuration, hasPostMessage: true };
          providerSignalRef.current = true; // provider is alive
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

  // When src changes, force iframe to hard-reload so autoplay fires cleanly
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // Blank it first, then set new src on next tick — forces a full reload
    iframe.src = "about:blank";
    const t = setTimeout(() => {
      if (iframeRef.current) iframeRef.current.src = src;
    }, 50);
    return () => clearTimeout(t);
  }, [src]);

  // Auto-click the player's initial play overlay after loader clears or src changes.
  // Only fires when the player hasn't started yet (hasPostMessage=false).
  // Once playing, user pause is fully respected — no auto-click interference.
  useEffect(() => {
    if (loaderVisible) return;

    const autoClick = () => {
      if (progressRef.current.hasPostMessage) return; // already playing, leave it alone

      const iframe = iframeRef.current;
      if (!iframe) return;

      // Try direct DOM access (same-origin or relaxed WebView)
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          const video = doc.querySelector("video") as HTMLVideoElement | null;
          if (video && video.paused) { video.play().catch(() => {}); return; }
          const el = doc.elementFromPoint(
            doc.documentElement.clientWidth / 2,
            doc.documentElement.clientHeight / 2,
          );
          (el as HTMLElement | null)?.click();
          return;
        }
      } catch { /* cross-origin — fall through */ }

      // Cross-origin fallback: fire pointer events at iframe centre
      const rect = iframe.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      ["pointerdown", "pointerup", "click"].forEach((type) => {
        iframe.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window,
        }));
      });
    };

    // Retry a few times — player overlay can take a moment to appear
    const t1 = setTimeout(autoClick, 600);
    const t2 = setTimeout(autoClick, 1800);
    const t3 = setTimeout(autoClick, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [loaderVisible, src]);

  // When app returns to foreground after being backgrounded, the WebView
  // suspends the iframe leaving a black screen. Reload the current src to recover.
  useEffect(() => {
    let hiddenAt = 0;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible") {
        // Only reload if we were backgrounded for more than 3 seconds
        // (avoids reload on brief screen-off flickers)
        const awayMs = Date.now() - hiddenAt;
        if (hiddenAt > 0 && awayMs > 3000) {
          const iframe = iframeRef.current;
          if (!iframe) return;
          // Reset hasPostMessage so auto-click fires again on reload
          progressRef.current.hasPostMessage = false;
          iframe.src = "about:blank";
          setTimeout(() => {
            if (iframeRef.current) iframeRef.current.src = src;
          }, 100);
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [src]);

  // Keep a stable ref to the latest persist so the interval never captures a stale closure
  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; }, [persist]);

  // Poll iframe video element every 5s for currentTime — works in Capacitor WebView
  // where cross-origin postMessages don't fire reliably
  useEffect(() => {
    const t = setInterval(() => {
      try {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const video = iframe.contentDocument?.querySelector("video") ||
          iframe.contentWindow?.document?.querySelector("video");
        if (!video) return;
        const ct = (video as HTMLVideoElement).currentTime;
        const dur = (video as HTMLVideoElement).duration;
        if (ct > 0) {
          const newDuration = (dur > 0 && isFinite(dur)) ? dur : progressRef.current.duration;
          progressRef.current = { watched: ct, duration: newDuration, hasPostMessage: true };
          providerSignalRef.current = true; // video is playing — cancel fallback
        }
      } catch { /* cross-origin block — fall back to postMessage */ }
    }, 5_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      const wallClockWatched = watchStartRef.current > 0
        ? Math.floor((Date.now() - watchStartRef.current) / 1000)
        : 0;
      const duration = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage
        ? progressRef.current.watched
        : wallClockWatched;
      // Never save more watched time than the known duration
      const watched = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (watched > 10) persistRef.current(watched, duration);
    }, 15_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tmdbId]);

  useEffect(() => {
    const save = () => {
      const wallClockWatched = watchStartRef.current > 0
        ? Math.floor((Date.now() - watchStartRef.current) / 1000)
        : 0;
      const duration = progressRef.current.duration;
      const rawWatched = progressRef.current.hasPostMessage
        ? progressRef.current.watched
        : wallClockWatched;
      const watched = duration > 0 ? Math.min(rawWatched, duration) : rawWatched;
      if (user && watched > 10) persistRef.current(watched, duration);
    };
    window.addEventListener("beforeunload", save);
    return () => { save(); window.removeEventListener("beforeunload", save); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (stillLoading) return;
    if (!canWatch) navigate("/");
  }, [stillLoading, canWatch, navigate]);

  // Lock to landscape when the player opens, restore portrait on exit
  useEffect(() => {
    const android = (window as any).AndroidOrientation;
    if (android?.lockLandscape) {
      android.lockLandscape();
    } else {
      // Fallback: Screen Orientation API (works in some browsers/PWA contexts)
      try { (screen.orientation as any).lock("landscape").catch(() => {}); } catch {}
    }
    return () => {
      if (android?.lockPortrait) {
        android.lockPortrait();
      } else {
        try { screen.orientation.unlock(); } catch {}
      }
    };
  }, []);

  if (stillLoading) return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>
  );
  if (!canWatch) return null;

  if (kidsBlocked) return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="text-6xl">🔒</div>
      <h2 className="text-xl font-bold text-white">Not Available for Kids</h2>
      <p className="text-sm text-white/70 max-w-xs">
        This title is rated <span className="font-bold text-primary">{kidsBlockedRating}</span> and cannot be played on a Kids profile.
      </p>
      <button
        onClick={() => navigate("/")}
        className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white"
      >
        Go Back
      </button>
    </div>
  );

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
          onDone={onLoaderDone}
        />
      )}

      <iframe
        ref={iframeRef}
        title="Player"
        className="absolute inset-0 h-full w-full border-0"
        referrerPolicy="no-referrer"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        onLoad={() => { triggerExplosion(); saveInitial(); }}
      />

      {!loaderVisible && !exitVisible && (
        <div
          className="absolute inset-x-0 bottom-0 top-16 z-10"
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
            onTouchStart={(e) => { e.stopPropagation(); navigate("/"); }}
            onClick={(e) => { e.stopPropagation(); navigate("/"); }}
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
