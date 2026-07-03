export type Provider = { name: string; url: string };

export function getProviders(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
  progress?: number,
): Provider[] {
  const color = "E50914";
  const progressParam = progress !== undefined ? `&progress=${progress}` : "";

  if (mediaType === "tv") {
    return [
      {
        name: "Videasy",
        url: `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}?color=${color}&nextEpisode=true&episodeSelector=true&autoplay=1&postMessageOrigin=*${progressParam}`,
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
      url: `https://player.videasy.net/movie/${tmdbId}?color=${color}&overlay=true&autoplay=1&postMessageOrigin=*${progressParam}`,
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
