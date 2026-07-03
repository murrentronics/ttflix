export type Provider = { name: string; url: string };

export function getProviders(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
  progress?: number, // seconds — forces Videasy to start at this position (0 = restart)
): Provider[] {
  const color = "E50914";
  const progressParam = progress !== undefined ? `&progress=${progress}` : "";
  // When forcing a restart (progress=0), add a timestamp so Videasy can't
  // serve a cached version with its stored resume position.
  const bustParam = progress === 0 ? `&_=${Date.now()}` : "";

  if (mediaType === "tv") {
    return [
      {
        name: "Videasy",
        url: `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}?color=${color}&nextEpisode=true&episodeSelector=true&autoplay=1&postMessageOrigin=*${progressParam}${bustParam}`,
      },
      {
        name: "VidSrc",
        url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}?autoplay=1`,
      },
    ];
  }

  return [
    {
      name: "Videasy",
      url: `https://player.videasy.net/movie/${tmdbId}?color=${color}&overlay=true&autoplay=1&postMessageOrigin=*${progressParam}${bustParam}`,
    },
    {
      name: "VidSrc",
      url: `https://vidsrc.to/embed/movie/${tmdbId}?autoplay=1`,
    },
  ];
}

export function streamUrl(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
): string {
  return getProviders(mediaType, tmdbId, season, episode)[0].url;
}
