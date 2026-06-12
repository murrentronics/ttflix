// Nexstream streaming embed helpers.
// NOTE: adjust STREAM_BASE if your Nexstream endpoint differs.
const STREAM_BASE = "https://nexstream.to/embed";

export function streamUrl(mediaType: "movie" | "tv", tmdbId: number) {
  return mediaType === "tv"
    ? `${STREAM_BASE}/tv/${tmdbId}`
    : `${STREAM_BASE}/movie/${tmdbId}`;
}
