/**
 * streamed.pk API — free, no key needed.
 * Provides live sports matches with real embed URLs for iframe players.
 */

const API = "https://streamed.pk";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LiveMatch = {
  id: string;
  title: string;
  category: string;
  date: number;
  poster?: string;
  popular: boolean;
  teams?: {
    home?: { name: string; badge: string };
    away?: { name: string; badge: string };
  };
  sources: { source: string; id: string }[];
};

export type LiveStream = {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
};

// ─── Image helpers ────────────────────────────────────────────────────────────

export function badgeUrl(badge: string) {
  return `${API}/api/images/badge/${badge}.webp`;
}

export function posterUrl(poster: string) {
  return `${API}/api/images/proxy/${poster}.webp`;
}

// ─── Sport category emoji map ─────────────────────────────────────────────────

export const SPORT_EMOJI: Record<string, string> = {
  football: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  hockey: "🏒",
  tennis: "🎾",
  mma: "🥊",
  boxing: "🥊",
  rugby: "🏉",
  cricket: "🏏",
  golf: "⛳",
  motorsport: "🏎️",
  cycling: "🚴",
  volleyball: "🏐",
  default: "🏆",
};

export function sportEmoji(category: string) {
  return SPORT_EMOJI[category.toLowerCase()] ?? SPORT_EMOJI.default;
}

// ─── Sport accent colours ─────────────────────────────────────────────────────

const SPORT_COLOR: Record<string, string> = {
  football: "#1a6e3c",
  basketball: "#c45e00",
  baseball: "#1a3a6e",
  hockey: "#1a5c7a",
  tennis: "#6e6e1a",
  mma: "#7a1a1a",
  boxing: "#7a1a1a",
  rugby: "#4a1a7a",
  cricket: "#1a6e3c",
  default: "#1a1a2e",
};

export function sportColor(category: string) {
  return SPORT_COLOR[category.toLowerCase()] ?? SPORT_COLOR.default;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Fetch all currently live matches.
 * Falls back to popular today's matches if nothing is live.
 */
export async function fetchLiveMatches(): Promise<LiveMatch[]> {
  try {
    const res = await fetch(`${API}/api/matches/live`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: LiveMatch[] = await res.json();
    if (Array.isArray(data) && data.length > 0) return data;

    // Nothing live right now — fall back to today's popular matches
    const res2 = await fetch(`${API}/api/matches/all-today/popular`, {
      headers: { Accept: "application/json" },
    });
    if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
    const data2: LiveMatch[] = await res2.json();
    return Array.isArray(data2) ? data2 : [];
  } catch {
    return [];
  }
}

/**
 * Fetch stream embed URLs for a match.
 * Tries each source in order and returns the first one that has streams.
 */
export async function fetchStreams(match: LiveMatch): Promise<LiveStream[]> {
  for (const src of match.sources) {
    try {
      const res = await fetch(`${API}/api/stream/${src.source}/${src.id}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const streams: LiveStream[] = await res.json();
      if (Array.isArray(streams) && streams.length > 0) return streams;
    } catch {
      continue;
    }
  }
  return [];
}
