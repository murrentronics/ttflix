import { useEffect, useState } from "react";

/**
 * Netflix-style TTFLIX loading overlay.
 * - Fades in on mount
 * - Shows the TTFLIX logo pulsing
 * - When `explode` becomes true → blasts outward and disappears
 * - Calls `onDone` after the explosion animation finishes
 */
export function TTFlixLoader({
  explode,
  onDone,
}: {
  explode: boolean;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"entering" | "idle" | "exploding" | "done">("entering");

  // Fade in
  useEffect(() => {
    const t = setTimeout(() => setPhase("idle"), 50);
    return () => clearTimeout(t);
  }, []);

  // Trigger explosion when player is ready
  useEffect(() => {
    if (explode && phase === "idle") {
      setPhase("exploding");
      // Wait for explosion animation then unmount
      const t = setTimeout(() => {
        setPhase("done");
        onDone();
      }, 600);
      return () => clearTimeout(t);
    }
  }, [explode, phase, onDone]);

  if (phase === "done") return null;

  const isExploding = phase === "exploding";
  const isVisible = phase === "idle" || phase === "exploding";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: isExploding ? "none" : "opacity 0.3s ease",
        // Explosion: scale up massively + fade
        transform: isExploding ? "scale(8)" : "scale(1)",
        transitionProperty: isExploding ? "transform, opacity" : "opacity",
        transitionDuration: isExploding ? "0.55s" : "0.3s",
        transitionTimingFunction: isExploding ? "cubic-bezier(0.4, 0, 1, 1)" : "ease",
      }}
    >
      {/* Logo */}
      <div
        style={{
          animation: isExploding ? "none" : "ttflix-pulse 1.6s ease-in-out infinite",
        }}
      >
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

      {/* Loading bar at bottom — shrinks as it loads */}
      {!isExploding && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-primary"
          style={{
            animation: "ttflix-bar 3s ease-in-out infinite",
          }}
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
