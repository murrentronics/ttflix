import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  applyTvClass,
  handleTvArrow,
  ensureTvFocus,
  isTvDevice,
  latchTvRemote,
  isTvBackKey,
  isTvActivateKey,
  arrowDir,
} from "@/lib/tv-navigation";

/** Installs D-pad spatial navigation and red focus rings on TV / Fire Stick. */
export function TvRemote() {
  const location = useLocation();

  useEffect(() => {
    applyTvClass();
    const poll = window.setInterval(applyTvClass, 400);
    const stop = window.setTimeout(() => window.clearInterval(poll), 8000);

    const onKey = (e: KeyboardEvent) => {
      const remoteKey = !!(arrowDir(e) || isTvBackKey(e) || isTvActivateKey(e));
      if (remoteKey) latchTvRemote();

      // Select / Accept on older remotes does not activate HTML buttons by itself.
      if (isTvActivateKey(e)) {
        const el = document.activeElement as HTMLElement | null;
        if (el && el !== document.body && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && !el.isContentEditable) {
          e.preventDefault();
          e.stopPropagation();
          el.click();
        }
        return;
      }

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
  }, [location.pathname, location.search, location.hash]);

  return null;
}
