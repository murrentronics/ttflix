import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { getProviders } from "@/lib/stream";
import { saveProgress } from "@/lib/continue-watching";
import { getDetails, getSeasonEpisodes } from "@/lib/tmdb.functions.app";
import { supabase, PLANS } from "@/lib/supabase";

export function WatchPage() {
  const { mediaType, id } = useParams<{ mediaType: string; id: string }>();
  const [searchParams] = useSearchParams();
  const { user, profile, session, loading, profileLoading, isAdmin } = useAuth();
  const { activeProfile, profiles } = useProfile();
  const effectiveProfile = activeProfile ?? profiles.find((p) => p.is_default) ?? profiles[0] ?? null;
  const navigate = useNavigate();

  const title = searchParams.get("title") ?? "";
  const poster = searchParams.get("poster") ?? "";
  const backdrop = searchParams.get("backdrop") ?? "";
  const season = Number(searchParams.get("season") ?? 1);
  const episode = Number(searchParams.get("episode") ?? 1);

  const type = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);
  const stillLoading = loading || profileLoading;
  const canWatch = isAdmin || (!!user && profile?.status === "approved");
  const isKidsProfile = activeProfile?.is_kids ?? false;

  const [screenError, setScreenError] = useState<string | null>(null);
  const [kidsBlocked, setKidsBlocked] = useState(false);
  const kidsBlockedRef = useRef(false);
  const [kidsBlockedRating, setKidsBlockedRating] = useState<string | null>(null);
  const kidsCheckDoneRef = useRef(!isKidsProfile);
  const watchIdRef = useRef<string | null>(null);
  const watchStartRef = useRef<number>(0);
  const durationRef = useRef(0);
  const savedInitial = useRef(false);

  const KIDS_BLOCKED_RATINGS = new Set(["PG-13", "R", "NC-17", "TV-14", "TV-MA", "18+", "18", "X"]);

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

  // ── Screen limit check ───────────────────────────────────────────────────────
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
        const upgradeMsg = profile!.plan === "basic" ? " Upgrade to Premium for up to 5 screens." : "";
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

  // Fetch runtime from TMDB
  useEffect(() => {
    durationRef.current = 0;
    savedInitial.current = false;
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
        if (runtimeMins && runtimeMins > 0) durationRef.current = runtimeMins * 60;
      } catch { /* ignore */ }
    }
    fetchDuration();
  }, [tmdbId, type, season, episode]);

  const saveInitial = useCallback(async () => {
    if (savedInitial.current || !user || !effectiveProfile || !title) return;
    if (kidsBlockedRef.current) return;
    savedInitial.current = true;
    await saveProgress({
      user_id: user.id, profile_id: effectiveProfile.id, tmdb_id: tmdbId, media_type: type,
      title, poster_path: poster || null, backdrop_path: backdrop || null,
      watched_seconds: 10, duration_seconds: durationRef.current,
      season: type === "tv" ? season : null, episode: type === "tv" ? episode : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop, season, episode]);

  // Save progress when player closes — wall-clock time
  const saveOnClose = useCallback(async () => {
    if (!user || !effectiveProfile || watchStartRef.current === 0) return;
    if (kidsBlockedRef.current) return;
    const wallClock = Math.floor((Date.now() - watchStartRef.current) / 1000);
    const duration = durationRef.current;
    const watched = duration > 0 ? Math.min(wallClock, duration) : wallClock;
    if (watched < 10) return;
    await saveProgress({
      user_id: user.id, profile_id: effectiveProfile.id, tmdb_id: tmdbId, media_type: type,
      title: title || `Title ${tmdbId}`, poster_path: poster || null, backdrop_path: backdrop || null,
      watched_seconds: watched, duration_seconds: duration,
      season: type === "tv" ? season : null, episode: type === "tv" ? episode : null,
    });
  }, [user, effectiveProfile, tmdbId, type, title, poster, backdrop, season, episode]);

  // When PlayerActivity closes (app resumes), save progress
  useEffect(() => {
    const onResume = async () => {
      if (watchStartRef.current > 0) {
        await saveOnClose();
        watchStartRef.current = 0;
      }
    };
    window.addEventListener("androidresume", onResume);
    return () => window.removeEventListener("androidresume", onResume);
  }, [saveOnClose]);

  const openPlayer = useCallback(() => {
    if (kidsBlockedRef.current) return;
    const url = getProviders(type, tmdbId, season, episode)[0].url;
    watchStartRef.current = Date.now();
    saveInitial();
    // Open in native PlayerActivity — fullscreen WebView, no browser chrome
    const androidPlayer = (window as any).AndroidPlayer;
    if (androidPlayer?.open) {
      androidPlayer.open(url);
    } else {
      // Fallback for browser/dev: open in new tab
      window.open(url, "_blank");
    }
  }, [type, tmdbId, season, episode, saveInitial]);

  // Auto-open player as soon as we know the user can watch
  // No intermediate screen needed — go straight to PlayerActivity
  useEffect(() => {
    if (stillLoading) return;
    if (!canWatch) return;
    if (kidsBlocked) return;
    if (screenError) return;
    openPlayer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillLoading, canWatch, kidsBlocked, screenError]);

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
      <button onClick={() => navigate("/")} className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white">
        Go Back
      </button>
    </div>
  );

  if (screenError) return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="text-6xl">📺</div>
      <h2 className="text-xl font-bold text-white">Too Many Screens</h2>
      <p className="text-sm text-white/70 max-w-xs">{screenError}</p>
      <button onClick={() => navigate("/")} className="rounded-full bg-primary px-8 py-3 text-sm font-bold text-white">Back to Home</button>
      {profile?.plan === "basic" && (
        <button onClick={() => navigate("/account")} className="rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white/80">
          Upgrade Plan
        </button>
      )}
    </div>
  );

  const backdropUrl = backdrop ? img(backdrop, "original") : poster ? img(poster, "w780") : null;

  // This page auto-launches PlayerActivity immediately.
  // Show a plain black screen while that happens.
  // Error/blocked states are shown below if needed.
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
      {/* Exit button — visible while waiting */}
      <div className="absolute top-0 left-0 z-20 p-3">
        <button
          onTouchStart={(e) => { e.stopPropagation(); navigate("/"); }}
          onClick={(e) => { e.stopPropagation(); navigate("/"); }}
          className="flex items-center gap-2 rounded-full bg-black/80 px-4 py-2.5 text-sm font-bold text-white"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <X className="h-4 w-4" /> Exit
        </button>
      </div>
    </div>
  );
}
