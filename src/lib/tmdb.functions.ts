import { createServerFn } from "@tanstack/react-start";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdb(path: string, params: Record<string, string> = {}) {
  // Works in both server (process.env) and Capacitor/client (import.meta.env) modes
  const key =
    (typeof process !== "undefined" && process.env?.TMDB_API_KEY) ||
    import.meta.env?.VITE_TMDB_API_KEY ||
    "";
  const url = new URL(TMDB_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = { accept: "application/json" };
  // v4 token (JWT) vs v3 api key
  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  } else {
    url.searchParams.set("api_key", key);
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status}`);
  }
  return res.json();
}

export type TmdbItem = {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string | null;
  media_type: "movie" | "tv";
};

function normalize(raw: any, fallbackType?: "movie" | "tv"): TmdbItem {
  const media_type = (raw.media_type ?? fallbackType ?? "movie") as "movie" | "tv";
  return {
    id: raw.id,
    title: raw.title ?? raw.name ?? "Untitled",
    overview: raw.overview ?? "",
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    vote_average: raw.vote_average ?? 0,
    release_date: raw.release_date ?? raw.first_air_date ?? null,
    media_type,
  };
}

/** Home page bundle: hero + multiple rows */
export const getHomeFeed = createServerFn({ method: "GET" }).handler(async () => {
  const [trending, popularMovies, topRatedMovies, popularTV, cartoons, action] =
    await Promise.all([
      tmdb("/trending/all/week", { language: "en-US" }),
      tmdb("/movie/popular", { language: "en-US", page: "1" }),
      tmdb("/movie/top_rated", { language: "en-US", page: "1" }),
      tmdb("/tv/popular", { language: "en-US", page: "1" }),
      tmdb("/discover/movie", {
        with_genres: "16",
        sort_by: "popularity.desc",
        language: "en-US",
        page: "1",
      }),
      tmdb("/discover/movie", {
        with_genres: "28",
        sort_by: "popularity.desc",
        language: "en-US",
        page: "1",
      }),
    ]);

  const trendingItems = (trending.results ?? [])
    .filter((r: any) => r.media_type !== "person")
    .map((r: any) => normalize(r));

  return {
    hero: trendingItems.slice(0, 6),
    rows: [
      { title: "Trending Now", items: trendingItems },
      { title: "Popular Movies", items: (popularMovies.results ?? []).map((r: any) => normalize(r, "movie")) },
      { title: "Top Rated", items: (topRatedMovies.results ?? []).map((r: any) => normalize(r, "movie")) },
      { title: "Popular TV Shows", items: (popularTV.results ?? []).map((r: any) => normalize(r, "tv")) },
      { title: "Cartoons & Animation", items: (cartoons.results ?? []).map((r: any) => normalize(r, "movie")) },
      { title: "Action & Adventure", items: (action.results ?? []).map((r: any) => normalize(r, "movie")) },
    ],
  };
});

/** Category listing: movies / tv / cartoons */
export const getCategory = createServerFn({ method: "GET" })
  .inputValidator((d: { category: "movies" | "tv" | "cartoons" }) => d)
  .handler(async ({ data }) => {
    if (data.category === "tv") {
      const [popular, top, trending] = await Promise.all([
        tmdb("/tv/popular", { page: "1" }),
        tmdb("/tv/top_rated", { page: "1" }),
        tmdb("/trending/tv/week", {}),
      ]);
      return {
        hero: (trending.results ?? []).map((r: any) => normalize(r, "tv")).slice(0, 6),
        rows: [
          { title: "Trending TV", items: (trending.results ?? []).map((r: any) => normalize(r, "tv")) },
          { title: "Popular Series", items: (popular.results ?? []).map((r: any) => normalize(r, "tv")) },
          { title: "Top Rated Series", items: (top.results ?? []).map((r: any) => normalize(r, "tv")) },
        ],
      };
    }
    if (data.category === "cartoons") {
      const [movies, tv, trending] = await Promise.all([
        tmdb("/discover/movie", { with_genres: "16", sort_by: "popularity.desc", page: "1" }),
        tmdb("/discover/tv", { with_genres: "16", sort_by: "popularity.desc", page: "1" }),
        tmdb("/discover/movie", { with_genres: "16", sort_by: "vote_count.desc", page: "1" }),
      ]);
      return {
        hero: (trending.results ?? []).map((r: any) => normalize(r, "movie")).slice(0, 6),
        rows: [
          { title: "Animated Movies", items: (movies.results ?? []).map((r: any) => normalize(r, "movie")) },
          { title: "Animated Series", items: (tv.results ?? []).map((r: any) => normalize(r, "tv")) },
          { title: "Top Animation", items: (trending.results ?? []).map((r: any) => normalize(r, "movie")) },
        ],
      };
    }
    // movies
    const [popular, top, trending, upcoming] = await Promise.all([
      tmdb("/movie/popular", { page: "1" }),
      tmdb("/movie/top_rated", { page: "1" }),
      tmdb("/trending/movie/week", {}),
      tmdb("/movie/upcoming", { page: "1" }),
    ]);
    return {
      hero: (trending.results ?? []).map((r: any) => normalize(r, "movie")).slice(0, 6),
      rows: [
        { title: "Trending Movies", items: (trending.results ?? []).map((r: any) => normalize(r, "movie")) },
        { title: "Popular", items: (popular.results ?? []).map((r: any) => normalize(r, "movie")) },
        { title: "Top Rated", items: (top.results ?? []).map((r: any) => normalize(r, "movie")) },
        { title: "Coming Soon", items: (upcoming.results ?? []).map((r: any) => normalize(r, "movie")) },
      ],
    };
  });

export const searchContent = createServerFn({ method: "GET" })
  .inputValidator((d: { query: string }) => d)
  .handler(async ({ data }) => {
    if (!data.query.trim()) return { results: [] as TmdbItem[] };
    const res = await tmdb("/search/multi", { query: data.query, page: "1" });
    return {
      results: (res.results ?? [])
        .filter((r: any) => r.media_type !== "person" && (r.poster_path || r.backdrop_path))
        .map((r: any) => normalize(r)),
    };
  });

export const getDetails = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number; mediaType: "movie" | "tv" }) => d)
  .handler(async ({ data }) => {
    const res = await tmdb(`/${data.mediaType}/${data.id}`, {
      append_to_response: "videos,credits,similar",
    });
    const trailer = (res.videos?.results ?? []).find(
      (v: any) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"),
    );
    return {
      id: res.id,
      title: res.title ?? res.name,
      overview: res.overview ?? "",
      backdrop_path: res.backdrop_path,
      poster_path: res.poster_path,
      vote_average: res.vote_average ?? 0,
      release_date: res.release_date ?? res.first_air_date ?? null,
      runtime: res.runtime ?? (res.episode_run_time?.[0] ?? null),
      genres: (res.genres ?? []).map((g: any) => g.name),
      cast: (res.credits?.cast ?? []).slice(0, 8).map((c: any) => c.name),
      number_of_seasons: res.number_of_seasons ?? null,
      trailerKey: trailer?.key ?? null,
      mediaType: data.mediaType,
      similar: (res.similar?.results ?? []).map((r: any) => normalize(r, data.mediaType)),
    };
  });
