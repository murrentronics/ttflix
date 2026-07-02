// ── Provider definitions ─────────────────────────────────────────────────────
// Videasy is tried first. If Videasy sends a "not found" signal OR fires no
// ready/progress signal within the timeout, WatchPage falls back to VidSrc.

export type Provider = { name: string; url: string };

export function getProviders(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season = 1,
  episode = 1,
  startOver = false,
): Provider[] {
  const color = "E50914";

  if (mediaType === "tv") {
    return [
      {
        name: "Videasy",
        url: `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}?color=${color}&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&autoplay=1&postMessageOrigin=*${startOver ? "&startTime=0" : ""}`,
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
      url: `https://player.videasy.net/movie/${tmdbId}?color=${color}&overlay=true&autoplay=1&postMessageOrigin=*${startOver ? "&startTime=0" : ""}`,
    },
    {
      name: "VidSrc",
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
  startOver = false,
): string {
  return getProviders(mediaType, tmdbId, season, episode, startOver)[0].url;
}
