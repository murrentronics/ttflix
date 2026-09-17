import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";

// Cloudflare Pages — version.json deployed here on every build
const VERSION_URL = "https://ttflix.pages.dev/version.json";

// Current version — patched automatically by the CI version bump script
const CURRENT_VERSION_NAME = "1.1.279";
const CURRENT_VERSION_CODE = 281;

type VersionInfo = {
  versionName: string;
  versionCode: number;
  releaseNotes: string;
  apkUrl: string;
};

function isNewer(latestVersionCode: number, currentVersionCode: number): boolean {
  return latestVersionCode > currentVersionCode;
}

function isAndroidTV(): boolean {
  try {
    const bridge = (window as any).AndroidDevice;
    if (bridge && typeof bridge.isTV === "function") return bridge.isTV();
  } catch { /* ignore */ }
  return /Android.*TV|BRAVIA|FireTV|AFT|leanback/i.test(navigator.userAgent);
}

export function UpdateChecker() {
  const [update, setUpdate] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (isAndroidTV()) return;

    fetch(`${VERSION_URL}?t=${Date.now()}`)
      .then((r) => r.json())
      .then((v: VersionInfo) => {
        if (isNewer(v.versionCode, CURRENT_VERSION_CODE)) {
          setUpdate(v);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!update || dismissed) return;
    const t = setTimeout(() => downloadBtnRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "GoBack") {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(true);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [update, dismissed]);

  const handleDownload = async () => {
    if (!update) return;
    setDownloading(true);
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({
        url: "https://ttflix.pages.dev",
        presentationStyle: "fullscreen",
        toolbarColor: "#141414",
      });
    } finally {
      setDownloading(false);
    }
  };

  if (!update || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#1f1f1f] shadow-2xl">
        <div className="flex items-center justify-between bg-[#e50914] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
              Update Available
            </p>
            <p className="text-xl font-black text-white">
              TTFlix v{update.versionName}
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-full bg-black/20 p-1.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-4 text-sm leading-relaxed text-[#aaa]">
            {update.releaseNotes}
          </p>

          <button
            ref={downloadBtnRef}
            onClick={handleDownload}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e50914] py-3.5 text-base font-bold text-white active:bg-[#a00610] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <Download className="h-5 w-5" />
            {downloading ? "Opening…" : `Download v${update.versionName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
