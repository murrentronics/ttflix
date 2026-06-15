// Videasy — clean player, no ads, TMDB-native, watch progress postMessage
const BASE = "https://player.videasy.net";

export function streamUrl(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
): string {
  const color = "E50914";
  if (mediaType === "tv") {
    return `${BASE}/tv/${tmdbId}/${season}/${episode}?color=${color}&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&postMessageOrigin=*`;
  }
  return `${BASE}/movie/${tmdbId}?color=${color}&overlay=true&postMessageOrigin=*`;
}
