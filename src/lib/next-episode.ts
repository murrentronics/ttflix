export type EpisodePos = { season: number; episode: number };

/** Build a 1-based season → episode-count array, filling the current season if that's all we have. */
export function seasonCountsFor(
  season: number,
  episodeCount: number | null,
  episodeCounts: number[],
): number[] {
  if (episodeCounts.length > 0) return episodeCounts;
  if (episodeCount == null || season < 1) return [];
  const counts = new Array(season).fill(0);
  counts[season - 1] = episodeCount;
  return counts;
}

/**
 * Netflix-style next episode: same season E+1, or next season E1.
 * Skips seasons that are known to have 0 episodes. Returns null at end of series.
 */
export function getNextEpisode(
  season: number,
  episode: number,
  counts: number[],
  totalSeasons?: number | null,
): EpisodePos | null {
  const seasons =
    totalSeasons && totalSeasons > 0 ? totalSeasons : Math.max(season, counts.length);
  if (season < 1 || episode < 1) return null;

  const countFor = (s: number) => (s >= 1 && s <= counts.length ? counts[s - 1] : -1);
  const curCount = countFor(season);

  if (curCount < 0) {
    // Current season count unknown — stay in-season so we don't skip a finale.
    return { season, episode: episode + 1 };
  }
  if (curCount > 0 && episode < curCount) {
    return { season, episode: episode + 1 };
  }

  for (let nextSeason = season + 1; nextSeason <= seasons; nextSeason++) {
    const n = countFor(nextSeason);
    if (n === 0) continue; // known empty (unreleased / specials gap)
    return { season: nextSeason, episode: 1 };
  }
  return null;
}

export function progressPercent(watched: number, duration: number): number | null {
  if (duration <= 0) return watched > 0 ? 4 : null;
  return Math.min(99, Math.max(0, Math.round((watched / duration) * 100)));
}

export function isNearlyFinished(watched: number, duration: number): boolean {
  return duration > 0 && watched / duration >= 0.92;
}
