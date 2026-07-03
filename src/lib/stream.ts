export type Provider = { name: string; url: string };

export function getProviders(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
  progress?: number,
): Provider[] {
  const progressParam = progress !== undefined ? `&progress=${progress}` : "";

  if (mediaType === "tv") {
    return [
      {
        name: "VidCore",
        url: `https://vidcore.org/embed/tv/${tmdbId}/${season}/${episode}?autoplay=1&postMessageOrigin=*${progressParam}`,
      },
      {
        name: "VidPop",
        url: `https://vidpop.xyz/tv/${tmdbId}/${season}/${episode}?autoplay=1`,
      },
    ];
  }

  return [
    {
      name: "VidCore",
      url: `https://vidcore.org/embed/movie/${tmdbId}?autoplay=1&postMessageOrigin=*${progressParam}`,
    },
    {
      name: "VidPop",
      url: `https://vidpop.xyz/movie/${tmdbId}?autoplay=1`,
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
