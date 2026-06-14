import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Cloudflare Pages — version.json deployed here on every build
const VERSION_URL = "https://ttflix.pages.dev/version.json";

// Current version — bump this manually when you want to trigger an update prompt
// or let the CI script patch it automatically
const CURRENT_VERSION = "1.1.1";

type VersionInfo = {
  versionName: string;
  versionCode: number;
  releaseNotes: string;
  apkUrl: string;
};

function isNewer(latest: string, current: string): boolean {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lv = l[i] ?? 0;
    const cv = c[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

export function UpdateChecker() {
  const [update, setUpdate] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only run inside Capacitor (Android), not in a browser
    const isCapacitor = typeof (window as any).Capacitor !== "undefined";
    if (!isCapacitor) return;

    fetch(`${VERSION_URL}?t=${Date.now()}`)
      .then((r) => r.json())
      .then((v: VersionInfo) => {
        if (isNewer(v.versionName, CURRENT_VERSION)) {
          setUpdate(v);
        }
      })
      .catch(() => {
        // Silently ignore — no popup on network failure
      });
  }, []);

  if (!update || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#1f1f1f] shadow-2xl">
        {/* Header */}
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
            className="rounded-full bg-black/20 p-1.5 text-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="mb-4 text-sm leading-relaxed text-[#aaa]">
            {update.releaseNotes}
          </p>

          <a
            href={update.apkUrl}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e50914] py-3.5 text-base font-bold text-white active:bg-[#a00610]"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <Download className="h-5 w-5" />
            Download v{update.versionName}
          </a>

          <button
            onClick={() => setDismissed(true)}
            className="mt-3 w-full rounded-xl py-2.5 text-sm text-[#666]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
