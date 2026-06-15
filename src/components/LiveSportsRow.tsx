import { useRef, useState, useCallback, useEffect } from "react";
import { Radio, X, RefreshCw, WifiOff, Play } from "lucide-react";
import { LIVE_SPORTS_CHANNELS, type LiveChannel } from "@/lib/live-sports";

// ─── Live badge ──────────────────────────────────────────────────────────────

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

// ─── Channel card ─────────────────────────────────────────────────────────────
// Large tap targets, no hover-dependent UI — all state shown permanently.

function ChannelCard({
  channel,
  onPress,
}: {
  channel: LiveChannel;
  onPress: (ch: LiveChannel) => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <button
      onTouchStart={() => onPress(channel)}   // instant on Android — no 300ms tap delay
      onClick={() => onPress(channel)}         // fallback for dev/desktop
      className="relative shrink-0 rounded-xl overflow-hidden text-left active:scale-95 transition-transform duration-150"
      style={{
        width: 200,
        height: 130,
        background: `linear-gradient(140deg, ${channel.color}ee 0%, #0d0d0d 100%)`,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 20% 30%, ${channel.color}55, transparent 65%)`,
        }}
      />

      {/* Content */}
      <div className="relative flex h-full flex-col justify-between p-3">
        {/* Top: logo / emoji + LIVE badge */}
        <div className="flex items-start justify-between">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
          >
            {!logoFailed ? (
              <img
                src={channel.logo}
                alt={channel.name}
                className="h-7 w-7 object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span>{channel.emoji}</span>
            )}
          </div>
          <LiveBadge />
        </div>

        {/* Bottom: name + description + tags */}
        <div>
          <p className="text-sm font-bold text-white leading-tight">{channel.name}</p>
          <p className="mt-0.5 text-[11px] text-white/60 line-clamp-1">{channel.description}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {channel.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white/70"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Permanent "tap to watch" indicator at bottom-right */}
      <div
        className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full px-2 py-1"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      >
        <Play className="h-2.5 w-2.5 fill-white text-white" />
        <span className="text-[9px] font-semibold text-white">Watch</span>
      </div>
    </button>
  );
}

// ─── Full-screen live player ──────────────────────────────────────────────────
// Mirrors WatchPage: touch anywhere to show/hide exit button,
// loading spinner while iframe loads, error fallback with retry.

type PlayerState = "loading" | "ready" | "error";

function LivePlayer({
  channel,
  onClose,
}: {
  channel: LiveChannel;
  onClose: () => void;
}) {
  const [playerState, setPlayerState] = useState<PlayerState>("loading");
  const [streamKey, setStreamKey] = useState(0); // increment to force iframe reload
  const [exitVisible, setExitVisible] = useState(true);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  // Auto-hide exit bar after 4s, just like WatchPage
  const showExit = useCallback(() => {
    setExitVisible(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setExitVisible(false), 4000);
  }, []);

  useEffect(() => {
    showExit(); // show on mount
    return () => { if (exitTimerRef.current) clearTimeout(exitTimerRef.current); };
  }, [showExit]);

  // Failsafe: if iframe doesn't fire onLoad within 15s, treat as error
  useEffect(() => {
    if (playerState !== "loading") return;
    const t = setTimeout(() => setPlayerState("error"), 15_000);
    return () => clearTimeout(t);
  }, [playerState, streamKey]);

  const handleRetry = () => {
    setPlayerState("loading");
    setStreamKey((k) => k + 1);
    showExit();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">

      {/* ── Top exit bar — auto-hides, re-appears on tap ── */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 transition-opacity duration-300"
        style={{
          opacity: exitVisible ? 1 : 0,
          pointerEvents: exitVisible ? "auto" : "none",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)",
        }}
      >
        {/* Channel info */}
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg"
            style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
          >
            {!logoFailed ? (
              <img
                src={channel.logo}
                alt={channel.name}
                className="h-6 w-6 object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span>{channel.emoji}</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-white leading-tight">{channel.name}</p>
              <LiveBadge />
            </div>
            <p className="text-[10px] text-white/50">{channel.description}</p>
          </div>
        </div>

        {/* Exit button — large tap target */}
        <button
          onTouchStart={(e) => { e.stopPropagation(); onClose(); }}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.7)",
            border: "1px solid rgba(255,255,255,0.2)",
            WebkitTapHighlightColor: "transparent",
            minWidth: 72,
            minHeight: 44,
          }}
        >
          <X className="h-4 w-4" /> Exit
        </button>
      </div>

      {/* ── Touch overlay — tap anywhere to show exit bar ── */}
      {!exitVisible && (
        <div
          className="absolute inset-0 z-10"
          onTouchStart={(e) => { e.stopPropagation(); showExit(); }}
          onClick={(e) => { e.stopPropagation(); showExit(); }}
        />
      )}

      {/* ── Loading state ── */}
      {playerState === "loading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black">
          <div
            className="h-14 w-14 rounded-full border-4 border-white/10 border-t-red-500"
            style={{ animation: "spin 0.9s linear infinite" }}
          />
          <p className="text-sm font-semibold text-white/70">Connecting to {channel.name}…</p>
          <p className="text-xs text-white/30">Live streams may take a moment</p>
        </div>
      )}

      {/* ── Error / unavailable state ── */}
      {playerState === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-black px-8 text-center">
          <WifiOff className="h-14 w-14 text-white/20" />
          <div>
            <p className="text-lg font-bold text-white">{channel.name} is unavailable</p>
            <p className="mt-2 text-sm text-white/50">
              The stream may be off-air or temporarily down.{"\n"}Try again or check back during a live event.
            </p>
          </div>
          <button
            onTouchStart={handleRetry}
            onClick={handleRetry}
            className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white"
            style={{
              backgroundColor: "#E50914",
              WebkitTapHighlightColor: "transparent",
              minHeight: 48,
            }}
          >
            <RefreshCw className="h-4 w-4" /> Try Again
          </button>
          <button
            onTouchStart={(e) => { e.stopPropagation(); onClose(); }}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-sm text-white/40 underline underline-offset-2"
            style={{ minHeight: 44, WebkitTapHighlightColor: "transparent" }}
          >
            Back to home
          </button>
        </div>
      )}

      {/* ── iframe player ── */}
      <iframe
        key={streamKey}
        src={channel.streamUrl}
        title={`${channel.name} Live`}
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        onLoad={() => setPlayerState("ready")}
        onError={() => setPlayerState("error")}
        style={{ zIndex: 1 }}
      />

      {/* Keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes livepulse { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
      `}</style>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

export function LiveSportsRow() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeChannel, setActiveChannel] = useState<LiveChannel | null>(null);

  // Swipe hint: faint gradient fade on right edge to hint scrollability
  return (
    <>
      {activeChannel && (
        <LivePlayer
          channel={activeChannel}
          onClose={() => setActiveChannel(null)}
        />
      )}

      <section className="relative mb-10">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2.5 px-4 sm:px-8">
          <Radio
            className="h-5 w-5 text-red-500"
            style={{ animation: "livepulse 1.2s ease-in-out infinite" }}
          />
          <h2 className="text-lg font-bold md:text-xl">Live Sports Channels</h2>
          <LiveBadge />
        </div>

        {/* Scrollable channel strip — native touch scroll, no arrow buttons */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto px-4 pb-3 sm:px-8"
          style={{
            // Smooth momentum scrolling on Android WebView
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",         // Firefox
            msOverflowStyle: "none",        // IE/Edge
          }}
        >
          {LIVE_SPORTS_CHANNELS.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} onPress={setActiveChannel} />
          ))}

          {/* Right-edge spacer so last card isn't flush against edge */}
          <div className="w-4 shrink-0" />
        </div>

        {/* Right fade hint — purely visual, no interaction */}
        <div
          className="pointer-events-none absolute right-0 top-8 h-[130px] w-16"
          style={{
            background: "linear-gradient(to left, var(--background, #0d0d0d) 0%, transparent 100%)",
          }}
        />
      </section>

      {/* Global keyframes — defined once here so both Row and Player can use them */}
      <style>{`
        @keyframes livepulse { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
        /* Hide scrollbar track on WebKit/Blink (Android WebView) */
        .live-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </>
  );
}
