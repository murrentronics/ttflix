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
  // Keep a stable ref so timers never capture a stale/changing onDone reference
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const t = setTimeout(() => setPhase("idle"), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (explode && (phase === "idle" || phase === "entering")) {
      setPhase("exploding");
      const t = setTimeout(() => {
        setPhase("done");
        onDoneRef.current();
      }, 400);
      return () => clearTimeout(t);
    }
  }, [explode, phase]);

  // Hard timeout — runs ONCE on mount, never resets
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
      {/* Movie backdrop behind the logo */}
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.35 }}
        />
      )}
      {/* Dark overlay so logo stays readable */}
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10" style={{ animation: isExploding ? "none" : "ttflix-pulse 1.6s ease-in-out infinite" }}>
        <span
          style={{
            fontFamily: "'Arial Black', 'Impact', sans-serif",
            fontSize: "clamp(3rem, 10vw, 6rem)",
            fontWeight: 900,
            letterSpacing: "0.04em",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          <span style={{ color: "#E50914" }}>TT</span>
          <span style={{ color: "#FFFFFF" }}>FLIX</span>
        </span>
      </div>

      {!isExploding && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-primary"
          style={{ animation: "ttflix-bar 3s ease-in-out infinite" }}
        />
      )}

      <style>{`
        @keyframes ttflix-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(0.97); }
        }
        @keyframes ttflix-bar {
          0% { width: 0%; opacity: 1; }
          70% { width: 85%; opacity: 1; }
          100% { width: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
