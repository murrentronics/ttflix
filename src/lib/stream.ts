// ── Provider definitions ─────────────────────────────────────────────────────
// Tried in order. If Videasy fires no ready/progress signal within the timeout,
// WatchPage automatically advances to the next provider.

export type Provider = { name: string; url: string };

export function getProviders(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
): Provider[] {
  const color = "E50914";

  if (mediaType === "tv") {
    return [
      {
        name: "Videasy",
        url: `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}?color=${color}&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&autoplay=1&postMessageOrigin=*`,
      },
      {
        name: "VidSrc",
        url: `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}&autoplay=1`,
      },
      {
        name: "VidSrc.to",
        url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}?autoplay=1`,
      },
    ];
  }

  return [
    {
      name: "Videasy",
      url: `https://player.videasy.net/movie/${tmdbId}?color=${color}&overlay=true&autoplay=1&postMessageOrigin=*`,
    },
    {
      name: "VidSrc",
      url: `https://vidsrc.me/embed/movie?tmdb=${tmdbId}&autoplay=1`,
    },
    {
      name: "VidSrc.to",
      url: `https://vidsrc.to/embed/movie/${tmdbId}?autoplay=1`,
    },
  ];
}

// Legacy single-URL helper kept for compatibility
export function streamUrl(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
): string {
  return getProviders(mediaType, tmdbId, season, episode)[0].url;
}
