import { useEffect, useRef, useState } from "react";
import { img } from "@/lib/tmdb";

export function TTFlixLoader({
  explode,
  onDone,
  backdrop,
  persistent = false,
  frozen = false,
}: {
  explode: boolean;
  onDone: () => void;
  backdrop?: string;
  persistent?: boolean;
  /** Boot splash: logo sits still, overlay stays opaque until explode. */
  frozen?: boolean;
}) {
  const [phase, setPhase] = useState<"entering" | "idle" | "exploding" | "done">(
    frozen ? "idle" : "entering"
  );
  const [elapsed, setElapsed] = useState(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (frozen) return;
    const t = setTimeout(() => setPhase("idle"), 520);
    return () => clearTimeout(t);
  }, [frozen]);

  useEffect(() => {
    if (frozen) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [frozen]);

  useEffect(() => {
    if (!explode) return;
    if (phase === "exploding" || phase === "done") return;
    if (!frozen && phase === "entering") return;
    setPhase("exploding");
    const t = setTimeout(() => {
      setPhase("done");
      onDoneRef.current();
    }, 450);
    return () => clearTimeout(t);
  }, [explode, phase, frozen]);

  useEffect(() => {
    if (persistent || frozen) return;
    const t = setTimeout(() => {
      setPhase("done");
      onDoneRef.current();
    }, 2500);
    return () => clearTimeout(t);
  }, [persistent, frozen]);

  if (phase === "done") return null;

  const isExploding = phase === "exploding";
  const isEntering = !frozen && phase === "entering";
  const backdropUrl = backdrop ? img(backdrop, "w780") : null;

  const statusMsg = frozen || !backdrop ? null :
    elapsed < 3 ? null :
    elapsed < 7 ? "Finding the best source…" :
    "Almost there…";

  const stage = isExploding
    ? { opacity: 0, transform: "scale(5.5)" }
    : frozen
      ? { opacity: 1, transform: "scale(1)" }
      : isEntering
        ? { opacity: 0, transform: "scale(0.28)" }
        : { opacity: 1, transform: "scale(1)" };

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center ${frozen ? "z-[9998]" : "z-[80]"}`}
      style={{
        ...stage,
        transition: isExploding
          ? "opacity 0.42s ease-out, transform 0.42s cubic-bezier(0.4, 0, 1, 1)"
          : frozen
            ? "none"
            : "opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: "none",
        backgroundColor: "#000",
      }}
    >
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.35 }}
        />
      )}
      {!frozen && <div className="absolute inset-0 bg-black/50" />}

      <div className="relative z-10 flex flex-col items-center gap-6">
        <span
          style={{
            fontFamily: "'Arial Black', 'Impact', sans-serif",
            fontSize: "clamp(3rem, 10vw, 6rem)",
            fontWeight: 900,
            letterSpacing: "0.04em",
            lineHeight: 1,
            userSelect: "none",
            animation: frozen || isExploding || isEntering ? "none" : "ttflix-pulse 1.6s ease-in-out infinite",
          }}
        >
          <span style={{ color: "#E50914" }}>TT</span>
          <span style={{ color: "#FFFFFF" }}>F</span>
        </span>

        {!frozen && !isExploding && elapsed >= 2 && (
          <div
            className="h-7 w-7 rounded-full border-2 border-white/20 border-t-white/80"
            style={{ animation: "ttflix-spin 0.8s linear infinite" }}
          />
        )}

        {!frozen && !isExploding && statusMsg && (
          <p
            className="text-sm text-white/50 text-center"
            style={{ animation: "ttflix-fadein 0.4s ease" }}
          >
            {statusMsg}
          </p>
        )}
      </div>

      {!frozen && !isExploding && (
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
