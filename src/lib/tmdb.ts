export const TMDB_IMG = "https://image.tmdb.org/t/p";

export function img(path: string | null | undefined, size: "w300" | "w500" | "w780" | "original" = "w500") {
  if (!path) return "";
  return `${TMDB_IMG}/${size}${path}`;
}

export function year(date: string | null | undefined) {
  if (!date) return "";
  return date.slice(0, 4);
}
