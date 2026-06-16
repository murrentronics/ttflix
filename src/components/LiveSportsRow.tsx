import { useEffect, useRef, useState, useCallback } from "react";
import { Radio, X, RefreshCw, WifiOff, Tv2 } from "lucide-react";
import {
  fetchLiveMatches,
  fetchStreams,
  badgeUrl,
  sportEmoji,
  sportColor,
  type LiveMatch,
  type LiveStream,
} from "@/lib/live-sports";

// ─── Pulsing LIVE badge ───────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
      style={{ backgroundColor: "#E50914" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-white"
        style={{ animation: "livepulse 1.2s ease-in-out infinite" }}
      />
      LIVE
    </span>
  );
}

// ─── Team badge image with emoji fallback ────────────────────────────────────

function TeamBadge({ badge, name, size = 28 }: { badge?: string; name?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!badge || failed) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/60"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {name ? name.slice(0, 2).toUpperCase() : "?"}
      </div>
    );
  }
  return (
    <img
      src={badgeUrl(badge)}
      alt={name ?? ""}
      width={size}
      height={size}
      loading="lazy"
      className="rounded-full object-contain"
      style={{ background: "rgba(255,255,255,0.08)" }}
      onError={() => setFailed(true)}
    />
  );
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  onClick,
}: {
  match: LiveMatch;
  onClick: (m: LiveMatch) => void;
}) {
  const color = sportColor(match.category);
  const emoji = sportEmoji(match.category);
  const hasTeams = match.teams?.home && match.teams?.away;
  const kickoff = new Date(match.date);
  const now = Date.now();
  const isLive = match.date <= now && now - match.date < 3 * 60 * 60 * 1000; // within 3h of kickoff

  return (
    <button
      onClick={() => onClick(match)}
      className="relative shrink-0 rounded-xl overflow-hidden text-left"
      style={{
        width: 200,
        minHeight: 130,
        background: `linear-gradient(145deg, ${color}dd 0%, #0d0d0d 100%)`,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 20% 20%, ${color}66, transparent 60%)`,
        }}
      />

      <div className="relative flex h-full flex-col justify-between p-3 gap-2">
        {/* Top row: sport emoji + badge */}
        <div className="flex items-center justify-between">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          >
            {emoji}
          </span>
          {isLive ? <LiveBadge /> : (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white/50"
              style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
              {kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {/* Teams */}
        {hasTeams ? (
          <div className="flex items-center gap-2">
            <TeamBadge badge={match.teams!.home!.badge} name={match.teams!.home!.name} size={26} />
            <div className="flex-1 min-w-0">
              <p className="truncate text-[11px] font-semibold text-white/90">
                {match.teams!.home!.name}
              </p>
              <p className="text-[10px] font-bold text-white/40">VS</p>
              <p className="truncate text-[11px] font-semibold text-white/90">
                {match.teams!.away!.name}
              </p>
            </div>
            <TeamBadge badge={match.teams!.away!.badge} name={match.teams!.away!.name} size={26} />
          </div>
        ) : (
          <p className="line-clamp-2 text-xs font-semibold text-white leading-snug">
            {match.title}
          </p>
        )}

        {/* Category pill */}
        <div className="flex items-center justify-between">
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/60"
            style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            {match.category}
          </span>
          <span className="text-[9px] text-white/30 font-medium">Tap to watch</span>
        </div>
      </div>
    </button>
  );
}

// ─── Full-screen player ───────────────────────────────────────────────────────

function LivePlayer({
  match,
  onClose,
}: {
  match: LiveMatch;
  onClose: () => void;
}) {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [activeStream, setActiveStream] = useState<LiveStream | null>(null);
  const [loadState, setLoadState] = useState<"fetching" | "loading" | "ready" | "error">("fetching");
  const [streamKey, setStreamKey] = useState(0);
  const [exitVisible, setExitVisible] = useState(true);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showExit = useCallback(() => {
    setExitVisible(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setExitVisible(false), 3000);
  }, []);

  useEffect(() => {
    showExit();
    return () => { if (exitTimerRef.current) clearTimeout(exitTimerRef.current); };
  }, [showExit]);

  // Fetch stream URLs from the API
  useEffect(() => {
    setLoadState("fetching");
    fetchStreams(match).then((s) => {
      if (s.length === 0) {
        setLoadState("error");
        return;
      }
      // Prefer HD English stream with most viewers (most reliable)
      const preferred =
        s.sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0))
         .find((x) => x.hd && x.language.toLowerCase().includes("english")) ??
        s.find((x) => x.hd) ??
        s[0];
      setStreams(s);
      setActiveStream(preferred);
      setLoadState("loading");
    });
  }, [match]);

  // 15s failsafe — if iframe never fires onLoad
  useEffect(() => {
    if (loadState !== "loading") return;
    const t = setTimeout(() => setLoadState("error"), 15_000);
    return () => clearTimeout(t);
  }, [loadState, streamKey]);

  const handleRetry = () => {
    setLoadState("loading");
    setStreamKey((k) => k + 1);
    showExit();
  };

  const switchStream = (s: LiveStream) => {
    setActiveStream(s);
    setLoadState("loading");
    setStreamKey((k) => k + 1);
    showExit();
  };

  const hasTeams = match.teams?.home && match.teams?.away;

  return (
    <div className="fixed inset-0 z-[9999] bg-black">

      {/* iframe — always rendered once we have a URL */}
      {activeStream && (
        <iframe
          key={streamKey}
          src={activeStream.embedUrl}
          title={match.title}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer"
          onLoad={() => setLoadState("ready")}
          onError={() => setLoadState("error")}
          style={{ zIndex: 1 }}
        />
      )}

      {/* Fetching stream URLs */}
      {loadState === "fetching" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black">
          <div
            className="h-12 w-12 rounded-full border-4 border-white/10 border-t-red-600"
            style={{ animation: "spin 0.9s linear infinite" }}
          />
          <p className="text-sm font-semibold text-white/70">Finding stream…</p>
        </div>
      )}

      {/* Buffering / iframe loading */}
      {loadState === "loading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black">
          <div
            className="h-12 w-12 rounded-full border-4 border-white/10 border-t-red-600"
            style={{ animation: "spin 0.9s linear infinite" }}
          />
          {hasTeams ? (
            <div className="flex items-center gap-3">
              <TeamBadge badge={match.teams!.home!.badge} name={match.teams!.home!.name} size={36} />
              <p className="text-base font-bold text-white">VS</p>
              <TeamBadge badge={match.teams!.away!.badge} name={match.teams!.away!.name} size={36} />
            </div>
          ) : (
            <p className="text-sm font-semibold text-white/70 px-6 text-center">{match.title}</p>
          )}
          <p className="text-xs text-white/30">Live stream connecting…</p>
        </div>
      )}

      {/* Error state */}
      {loadState === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-black px-8 text-center">
          <WifiOff className="h-14 w-14 text-white/20" />
          <div>
            <p className="text-base font-bold text-white">{match.title}</p>
            <p className="mt-2 text-sm text-white/50">
              Stream unavailable right now. It may not have started yet or is temporarily down.
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white"
            style={{ backgroundColor: "#E50914", WebkitTapHighlightColor: "transparent" }}
          >
            <RefreshCw className="h-4 w-4" /> Try Again
          </button>
          <button
            onClick={onClose}
            className="text-sm text-white/40 underline underline-offset-2"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Back to home
          </button>
        </div>
      )}

      {/* Tap catcher to restore exit bar */}
      {!exitVisible && (
        <div
          className="absolute inset-x-0 bottom-0 top-16 z-10"
          onClick={showExit}
        />
      )}

      {/* Exit bar — top left, same as WatchPage */}
      <div
        className="absolute top-0 left-0 z-20 p-3 transition-opacity duration-300"
        style={{ opacity: exitVisible ? 1 : 0, pointerEvents: exitVisible ? "auto" : "none" }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="flex items-center gap-2 rounded-full bg-black/80 px-4 py-2.5 text-sm font-bold text-white"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <X className="h-4 w-4" /> Exit
        </button>
      </div>

      {/* Match info — top right */}
      <div
        className="absolute top-3 right-3 z-20 transition-opacity duration-300"
        style={{ opacity: exitVisible ? 1 : 0, pointerEvents: "none" }}
      >
        {hasTeams ? (
          <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5">
            <TeamBadge badge={match.teams!.home!.badge} name={match.teams!.home!.name} size={20} />
            <span className="text-[11px] font-bold text-white/80">VS</span>
            <TeamBadge badge={match.teams!.away!.badge} name={match.teams!.away!.name} size={20} />
            <span className="ml-1"><LiveBadge /></span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5">
            <p className="text-xs font-bold text-white">{match.title}</p>
            <LiveBadge />
          </div>
        )}
      </div>

      {/* Stream switcher — bottom bar, shows if multiple streams available */}
      {streams.length > 1 && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300"
          style={{ opacity: exitVisible ? 1 : 0, pointerEvents: exitVisible ? "auto" : "none" }}
        >
          <div className="flex gap-2 overflow-x-auto px-4 pb-4 pt-2"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {streams.map((s) => (
              <button
                key={s.id + s.streamNo}
                onClick={(e) => { e.stopPropagation(); switchStream(s); }}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                style={{
                  backgroundColor: activeStream?.streamNo === s.streamNo ? "#E50914" : "rgba(0,0,0,0.7)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {s.hd ? "HD" : "SD"} · {s.language}{s.viewers ? ` · ${s.viewers.toLocaleString()} 👁` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes livepulse { 0%,100%{opacity:1;} 50%{opacity:0.25;} }
      `}</style>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center px-4">
      <Tv2 className="h-10 w-10 text-white/20" />
      <p className="text-sm font-semibold text-white/40">No live matches right now</p>
      <p className="text-xs text-white/25">Check back when a game is on</p>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

export function LiveSportsRow({ standalone = false }: { standalone?: boolean }) {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMatch, setActiveMatch] = useState<LiveMatch | null>(null);

  useEffect(() => {
    fetchLiveMatches().then((m) => {
      setMatches(m);
      setLoading(false);
    });
  }, []);

  // Don't render the row at all while loading (avoids a flash)
  if (loading) return null;

  return (
    <>
      {activeMatch && (
        <LivePlayer match={activeMatch} onClose={() => setActiveMatch(null)} />
      )}

      <section className="relative mb-10">
        {/* Header — hidden on standalone page since the page has its own */}
        {!standalone && (
          <div className="mb-3 flex items-center gap-2.5 px-4 sm:px-8">
            <Radio
              className="h-5 w-5 text-red-500"
              style={{ animation: "livepulse 1.2s ease-in-out infinite" }}
            />
            <h2 className="text-lg font-bold md:text-xl">Live Sports</h2>
            {matches.length > 0 && <LiveBadge />}
            {matches.length > 0 && (
              <span className="text-xs text-white/30 ml-1">{matches.length} match{matches.length !== 1 ? "es" : ""}</span>
            )}
          </div>
        )}

        {matches.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Scrollable strip */}
            <div
              className="flex gap-3 overflow-x-auto px-4 pb-3 sm:px-8"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} onClick={setActiveMatch} />
              ))}
              <div className="w-4 shrink-0" />
            </div>

            {/* Right edge fade hint */}
            <div
              className="pointer-events-none absolute right-0 top-8 h-[130px] w-14"
              style={{
                background: "linear-gradient(to left, var(--background, #0d0d0d) 0%, transparent 100%)",
              }}
            />
          </>
        )}
      </section>

      <style>{`
        @keyframes livepulse { 0%,100%{opacity:1;} 50%{opacity:0.25;} }
      `}</style>
    </>
  );
}
