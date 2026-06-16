/**
 * sportsrc.org API — free, no key, CORS enabled.
 * Returns real matches with embed URLs on embed.streamapi.cc
 * which works correctly inside an Android WebView iframe.
 */

const API = "https://api.sportsrc.org";

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
};

export type LiveStream = {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
  viewers?: number;
};

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

const SPORT_CATEGORIES = ["football", "basketball", "baseball", "hockey", "tennis", "mma", "boxing", "rugby", "cricket"];

/**
 * Fetch live/upcoming matches across all sports.
 * Fetches football + basketball in parallel, merges, sorts by date.
 * Falls back to upcoming if nothing is currently live.
 */
export async function fetchLiveMatches(): Promise<LiveMatch[]> {
  try {
    const now = Date.now();

    // Fetch football and basketball in parallel (most popular for T&T viewers)
    const results = await Promise.allSettled(
      ["football", "basketball"].map((cat) =>
        fetch(`${API}/?data=matches&category=${cat}`, { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((d) => (d.success && Array.isArray(d.data) ? (d.data as LiveMatch[]) : []))
          .catch(() => [] as LiveMatch[])
      )
    );

    const all: LiveMatch[] = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

    // Sort by date, show matches within ±4 hours of now first
    const relevant = all
      .filter((m) => Math.abs(m.date - now) < 4 * 60 * 60 * 1000)
      .sort((a, b) => Math.abs(a.date - now) - Math.abs(b.date - now));

    if (relevant.length > 0) return relevant;

    // Nothing near-live — return next 20 upcoming sorted by time
    return all.sort((a, b) => a.date - b.date).slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * Fetch stream embed URLs for a specific match via the detail endpoint.
 * Returns streams sorted by viewers desc — most watched = most reliable.
 */
export async function fetchStreams(match: LiveMatch): Promise<LiveStream[]> {
  try {
    const res = await fetch(
      `${API}/?data=detail&category=${match.category}&id=${match.id}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.success || !json.data?.sources) return [];

    const streams: LiveStream[] = json.data.sources;
    // Sort by viewers desc so the most active stream is first
    return streams.sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0));
  } catch {
    return [];
  }
}
