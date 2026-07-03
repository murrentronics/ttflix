export type Provider = { name: string; url: string };

export function getProviders(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
  fresh = false,
): Provider[] {
  const color = "E50914";

  const videasy: Provider = mediaType === "tv"
    ? { name: "Videasy", url: `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}?color=${color}&nextEpisode=true&episodeSelector=true&autoplay=1&postMessageOrigin=*` }
    : { name: "Videasy", url: `https://player.videasy.net/movie/${tmdbId}?color=${color}&overlay=true&autoplay=1&postMessageOrigin=*` };

  const vidsrc: Provider = mediaType === "tv"
    ? { name: "VidSrc", url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}?autoplay=1` }
    : { name: "VidSrc", url: `https://vidsrc.to/embed/movie/${tmdbId}?autoplay=1` };

  // When fresh=true (title was removed from continue watching), use VidSrc first
  // since it has no stored resume position, unlike Videasy.
  return fresh ? [vidsrc, videasy] : [videasy, vidsrc];
}

export function streamUrl(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
): string {
  return getProviders(mediaType, tmdbId, season, episode)[0].url;
}
