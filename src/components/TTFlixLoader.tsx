import { useEffect, useRef, useState } from "react";
import { img } from "@/lib/tmdb";

export function TTFlixLoader({
  explode,
  onDone,
  backdrop,
}: {
  explode: boolean;
  onDone: () => void;
  backdrop?: string;
}) {
  const [phase, setPhase] = useState<"entering" | "idle" | "exploding" | "done">("entering");
  // How long we've been waiting — drives the "still loading" message
  const [elapsed, setElapsed] = useState(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const t = setTimeout(() => setPhase("idle"), 50);
    return () => clearTimeout(t);
  }, []);

  // Tick every second so we can show helpful status messages
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);  useEffect(() => {
    if (explode && (phase === "idle" || phase === "entering")) {
      setPhase("exploding");
      const t = setTimeout(() => {
        setPhase("done");
        onDoneRef.current();
      }, 400);
      return () => clearTimeout(t);
    }
  }, [explode, phase]);

  // Hard timeout — runs ONCE on mount, never resets — always clears the loader
  useEffect(() => {
    const t = setTimeout(() => {
      setPhase("done");
      onDoneRef.current();
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  if (phase === "done") return null;

  const isExploding = phase === "exploding";
  const backdropUrl = backdrop ? img(backdrop, "w780") : null;

  // Status message based on elapsed time
  const statusMsg =
    elapsed < 3 ? null :
    elapsed < 7 ? "Finding the best source…" :
    "Almost there…";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        opacity: isExploding ? 0 : 1,
        transform: isExploding ? "scale(4)" : "scale(1)",
        transition: isExploding
          ? "opacity 0.35s ease-out, transform 0.35s ease-out"
          : "opacity 0.3s ease",
        pointerEvents: "none",
        backgroundColor: "#000",
      }}
    >
      {/* Movie backdrop */}
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.35 }}
        />
      )}
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Logo */}
        <span
          style={{
            fontFamily: "'Arial Black', 'Impact', sans-serif",
            fontSize: "clamp(3rem, 10vw, 6rem)",
            fontWeight: 900,
            letterSpacing: "0.04em",
            lineHeight: 1,
            userSelect: "none",
            animation: isExploding ? "none" : "ttflix-pulse 1.6s ease-in-out infinite",
          }}
        >
          <span style={{ color: "#E50914" }}>TT</span>
          <span style={{ color: "#FFFFFF" }}>FLIX</span>
        </span>

        {/* Spinner — shows after 2s so fast loads don't flash it */}
        {!isExploding && elapsed >= 2 && (
          <div
            className="h-7 w-7 rounded-full border-2 border-white/20 border-t-white/80"
            style={{ animation: "ttflix-spin 0.8s linear infinite" }}
          />
        )}

        {/* Status message */}
        {!isExploding && statusMsg && (
          <p
            className="text-sm text-white/50 text-center"
            style={{ animation: "ttflix-fadein 0.4s ease" }}
          >
            {statusMsg}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {!isExploding && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-primary"
          style={{ animation: "ttflix-bar 8s ease-in-out forwards" }}
        />
      )}

      <style>{`
        @keyframes ttflix-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(0.97); }
        }
        @keyframes ttflix-bar {
          0%   { width: 0%;   opacity: 1; }
          80%  { width: 90%;  opacity: 1; }
          100% { width: 100%; opacity: 0; }
        }
        @keyframes ttflix-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes ttflix-fadein {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
