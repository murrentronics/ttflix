import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { isTvBackKey } from "@/lib/tv-navigation";
import {
  fetchLatestVersion,
  hasNativeApk,
  openDownloadedApk,
  readApkStatus,
  startApkDownload,
  type VersionInfo,
} from "@/lib/apk-update";

// Current version — patched automatically by the CI version bump script
const CURRENT_VERSION_NAME = "1.1.290";
const CURRENT_VERSION_CODE = 292;

function isAndroidTV(): boolean {
  try {
    const bridge = (window as any).AndroidDevice;
    if (bridge && typeof bridge.isTV === "function") return bridge.isTV();
  } catch { /* ignore */ }
  return /Android.*TV|BRAVIA|FireTV|AFT|leanback/i.test(navigator.userAgent);
}

type Phase = "idle" | "running" | "done" | "failed" | "need_permission";

export function UpdateChecker() {
  const [update, setUpdate] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const actionRef = useRef<HTMLButtonElement>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (isAndroidTV()) return;
    if (!hasNativeApk()) return;

    const check = () => {
      fetchLatestVersion()
        .then((v) => {
          if (v.versionCode > CURRENT_VERSION_CODE) setUpdate(v);
        })
        .catch(() => {});
    };
    check();
    const interval = window.setInterval(check, 4 * 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!update || dismissed) return;
    const t = window.setTimeout(() => actionRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (isTvBackKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(true);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [update, dismissed]);

  useEffect(() => {
    if (phase !== "running" || !update) return;
    const tick = () => {
      const s = readApkStatus();
      setProgress(s.progress);
      if (s.state === "done") {
        setPhase("done");
        setProgress(100);
        setStatus("Ready to install");
        if (!openedRef.current) {
          openedRef.current = true;
          const result = openDownloadedApk();
          if (result === "need_permission") {
            setPhase("need_permission");
            setStatus("Allow installs for TTFlix, then tap Install.");
          } else if (result === "failed") {
            setPhase("failed");
            setStatus("Downloaded, but the installer didn't open.");
          } else {
            setStatus("Opening installer…");
          }
        }
      } else if (s.state === "failed") {
        setPhase("failed");
        setStatus(s.error || "Download failed");
      } else if (s.state === "running") {
        setStatus(s.progress > 0 ? `Downloading… ${s.progress}%` : "Downloading update…");
      }
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [phase, update]);

  const installOrAllow = () => {
    const result = openDownloadedApk();
    if (result === "need_permission") {
      setPhase("need_permission");
      setStatus("Allow installs for TTFlix, then come back and tap Install.");
      return;
    }
    if (result === "failed") {
      setPhase("failed");
      setStatus("Couldn't open the installer. Tap Update now to download again.");
      return;
    }
    setPhase("done");
    setStatus("Opening installer…");
  };

  const handleUpdate = () => {
    if (!update) return;
    if (phase === "done" || phase === "need_permission") {
      installOrAllow();
      return;
    }
    openedRef.current = false;
    setPhase("running");
    setProgress(0);
    setStatus("Downloading update…");
    startApkDownload(update.versionCode, update.versionName);
  };

  if (!update || dismissed) return null;

  const busy = phase === "running";
  const ready = phase === "done" || phase === "need_permission";
  const buttonLabel = busy
    ? progress > 0 ? `Downloading… ${progress}%` : "Downloading…"
    : ready
      ? phase === "need_permission" ? "Allow installs" : "Install"
      : phase === "failed"
        ? "Try again"
        : "Update now";

  return (
    <div data-tv-zone="modal" className="fixed inset-0 z-[9999] flex items-end bg-black/75 backdrop-blur-sm">
      <div className="w-full rounded-t-3xl border-t border-white/10 bg-[#1f1f1f] px-5 pb-8 pt-5 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
              New version available
            </p>
            <p className="text-2xl font-black text-white">v{update.versionName}</p>
            <p className="mt-0.5 text-xs text-white/50">You're on v{CURRENT_VERSION_NAME}</p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {update.releaseNotes ? (
          <div className="mt-4 rounded-2xl bg-black/40 px-4 py-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/40">What's new</p>
            <p className="text-sm leading-relaxed text-white/80">
              {update.releaseNotes.slice(0, 300)}{update.releaseNotes.length > 300 ? "…" : ""}
            </p>
          </div>
        ) : null}

        {busy && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#e50914] transition-[width] duration-300"
              style={{ width: `${Math.max(progress, 4)}%` }}
            />
          </div>
        )}

        {status ? (
          <p className="mt-3 text-center text-xs text-white/55">{status}</p>
        ) : null}

        <div className="mt-4 space-y-2">
          <button
            ref={actionRef}
            onClick={handleUpdate}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#e50914] py-3.5 text-sm font-bold text-white disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {buttonLabel}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="w-full rounded-full border border-white/15 py-3 text-sm font-semibold text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}
