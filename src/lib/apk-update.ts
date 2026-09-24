/** Same host as the public download page — never GitHub or Capacitor Browser. */
export const PAGES_HOST = "https://ttflix.pages.dev";
export const VERSION_URL = `${PAGES_HOST}/version.json`;

export type VersionInfo = {
  versionName: string;
  versionCode: number;
  releaseNotes: string;
};

export type ApkStatus = {
  state: "idle" | "running" | "done" | "failed";
  progress: number;
  bytes?: number;
  file?: string;
  error?: string;
};

export function pagesApkUrl(versionCode: number): string {
  return `${PAGES_HOST}/ttflix.apk?v=${versionCode}`;
}

export async function fetchLatestVersion(): Promise<VersionInfo> {
  const r = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("Could not check for updates");
  const v = await r.json();
  return {
    versionName: String(v.versionName ?? ""),
    versionCode: Number(v.versionCode ?? 0),
    releaseNotes: String(v.releaseNotes ?? "Bug fixes and improvements"),
  };
}

export function hasNativeApk(): boolean {
  try {
    return typeof (window as any).AndroidApk?.download === "function";
  } catch {
    return false;
  }
}

export function startApkDownload(versionCode: number, versionName: string) {
  const url = pagesApkUrl(versionCode);
  const filename = `TTFlix-v${versionName}.apk`;
  (window as any).AndroidApk.download(url, filename);
}

export function readApkStatus(): ApkStatus {
  try {
    const raw = (window as any).AndroidApk?.status?.();
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!p || typeof p !== "object") return { state: "idle", progress: 0 };
    const state = p.state === "running" || p.state === "done" || p.state === "failed" ? p.state : "idle";
    return {
      state,
      progress: Math.max(0, Math.min(100, Number(p.progress) || 0)),
      bytes: Number(p.bytes) > 0 ? Number(p.bytes) : undefined,
      file: p.file || undefined,
      error: p.error || undefined,
    };
  } catch {
    return { state: "idle", progress: 0 };
  }
}

export function openDownloadedApk(): string {
  try {
    return String((window as any).AndroidApk?.open?.() ?? "");
  } catch {
    return "failed";
  }
}

export const APK_UPDATE_EVENT = "ttflix-apk-update";

export function requestApkUpdateUi() {
  window.dispatchEvent(new Event(APK_UPDATE_EVENT));
}
