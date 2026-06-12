// Nexstream (CodeSpecter) streaming embed helpers.
// Domain-locked publishable embed key — safe to use client-side.
const STREAM_BASE = "https://api.codespecters.com/embed";
const API_KEY = "nx_c8f50fe3da4213c546832ee364693fa1";

export function streamUrl(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
) {
  if (mediaType === "tv") {
    return `${STREAM_BASE}/tv/${tmdbId}/${season}/${episode}?apikey=${API_KEY}`;
  }
  return `${STREAM_BASE}/movie/${tmdbId}?apikey=${API_KEY}`;
}
