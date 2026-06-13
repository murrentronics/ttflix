// Videasy — clean player, no ads, TMDB-native, watch progress postMessage
// Docs: https://www.videasy.to/docs
const BASE = "https://player.videasy.net";

export function streamUrl(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
): string {
  // TTFlix red accent, Netflix overlay, episode selector for TV
  const color = "E50914";
  if (mediaType === "tv") {
    return `${BASE}/tv/${tmdbId}/${season}/${episode}?color=${color}&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true`;
  }
  return `${BASE}/movie/${tmdbId}?color=${color}&overlay=true`;
}
