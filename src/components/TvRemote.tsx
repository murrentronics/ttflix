import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyTvClass, handleTvArrow, ensureTvFocus, isTvDevice } from "@/lib/tv-navigation";

/** Installs D-pad spatial navigation and red focus rings on TV / Fire Stick. */
export function TvRemote() {
  const location = useLocation();

  useEffect(() => {
    applyTvClass();
    const poll = window.setInterval(applyTvClass, 400);
    const stop = window.setTimeout(() => window.clearInterval(poll), 8000);

    const onKey = (e: KeyboardEvent) => {
      if (!handleTvArrow(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!isTvDevice()) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-tv-zone='footer']")) {
        ensureTvFocus();
      }
    };

    window.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(stop);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, []);

  useEffect(() => {
    applyTvClass();
    const t = window.setTimeout(ensureTvFocus, 80);
    return () => window.clearTimeout(t);
  }, [location.pathname]);

  return null;
}
