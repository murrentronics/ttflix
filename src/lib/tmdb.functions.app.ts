/**
 * Capacitor/SPA build shim for tmdb.functions.ts
 * Same API surface as tmdb.functions.ts but calls TMDB directly
 * from the client (no createServerFn / SSR needed).
 */

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdb(path: string, params: Record<string, string> = {}) {
  const key = import.meta.env.VITE_TMDB_API_KEY ?? "";
  const url = new URL(TMDB_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = { accept: "application/json" };
  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  } else {
    url.searchParams.set("api_key", key);
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`);
  return res.json();
}

/** Fetch two pages in parallel and merge results (up to ~40 items) */
async function tmdbPages(path: string, params: Record<string, string> = {}) {
  const [p1, p2] = await Promise.all([
    tmdb(path, { ...params, page: "1" }),
    tmdb(path, { ...params, page: "2" }),
  ]);
  return { results: [...(p1.results ?? []), ...(p2.results ?? [])] };
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

export async function getHomeFeed(isKids = false) {
  // Kids mode: only fetch G/PG certified content, no adult genres
  if (isKids) {
    const kidsParams = {
      language: "en-US",
      certification_country: "US",
      "certification.lte": "PG",
      "vote_count.gte": "50",
      include_adult: "false",
    };
    const [
      family,
      kidsTV,
      topRatedKids,
      adventure,
      comedy,
      classicKids,
      kidsNewReleases,
    ] = await Promise.all([
      // Family Movies (genre 10751) — main row
      tmdbPages("/discover/movie", { ...kidsParams, with_genres: "10751", sort_by: "popularity.desc" }),
      // Kids TV Shows (genre 10762 = kids)
      tmdbPages("/discover/tv", { language: "en-US", with_genres: "10762", sort_by: "popularity.desc", include_adult: "false" }),
      // Top Rated Kids — high vote average, broad PG cert
      tmdbPages("/discover/movie", { ...kidsParams, sort_by: "vote_average.desc", "vote_count.gte": "300" }),
      // Adventure for Kids (genre 12) — distinct from family
      tmdbPages("/discover/movie", { ...kidsParams, with_genres: "12", sort_by: "popularity.desc" }),
      // Comedy for Kids (genre 35)
      tmdbPages("/discover/movie", { ...kidsParams, with_genres: "35", sort_by: "popularity.desc" }),
      // Classic Kids — older beloved titles (before 2010)
      tmdbPages("/discover/movie", { ...kidsParams, with_genres: "10751,16", sort_by: "vote_average.desc", "vote_count.gte": "200", "primary_release_date.lte": "2010-12-31" }),
      // New Releases for Kids — most recent
      tmdbPages("/discover/movie", { ...kidsParams, sort_by: "primary_release_date.desc", "vote_count.gte": "20" }),
    ]);

    const heroSource = (family.results ?? []).map((r: any) => normalize(r, "movie"));
    return {
      hero: heroSource.slice(0, 6),
      rows: [
        { title: "Family Movies",         items: (family.results ?? []).map((r: any) => normalize(r, "movie")) },
        { title: "Kids TV Shows",         items: (kidsTV.results ?? []).map((r: any) => normalize(r, "tv")) },
        { title: "Top Rated for Kids",    items: (topRatedKids.results ?? []).map((r: any) => normalize(r, "movie")) },
        { title: "Adventure & Discovery", items: (adventure.results ?? []).map((r: any) => normalize(r, "movie")) },
        { title: "Fun & Comedy",          items: (comedy.results ?? []).map((r: any) => normalize(r, "movie")) },
        { title: "Classic Favourites",    items: (classicKids.results ?? []).map((r: any) => normalize(r, "movie")) },
        { title: "New for Kids",          items: (kidsNewReleases.results ?? []).map((r: any) => normalize(r, "movie")) },
      ],
    };
  }

  const [trending, popularMovies, topRatedMovies, popularTV, cartoons, action] =
    await Promise.all([
      tmdb("/trending/all/week", { language: "en-US" }),
      tmdbPages("/movie/popular", { language: "en-US" }),
      tmdbPages("/movie/top_rated", { language: "en-US" }),
      tmdbPages("/tv/popular", { language: "en-US" }),
      tmdbPages("/discover/movie", { with_genres: "16", sort_by: "popularity.desc", language: "en-US", include_adult: "false" }),
      tmdbPages("/discover/movie", { with_genres: "28", sort_by: "popularity.desc", language: "en-US", include_adult: "false" }),
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
}

// Adult/mature genre IDs to exclude for kids mode
const ADULT_GENRE_IDS = [27, 53, 80, 10752, 37, 10749, 9648, 10769];
const ADULT_GENRES_EXCLUDE = ADULT_GENRE_IDS.join(",");

// Kids-safe: no adult genres, not marked adult, vote_average reasonable
function isKidsSafe(r: any): boolean {
  if (r.adult === true) return false;
  const genres: number[] = r.genre_ids ?? [];
  // If genre_ids present, check them
  if (genres.length > 0 && genres.some((g) => ADULT_GENRE_IDS.includes(g))) return false;
  // Block if title/overview contains obvious adult keywords
  const text = `${r.title ?? r.name ?? ""} ${r.overview ?? ""}`.toLowerCase();
  const blocked = ["porn", "xxx", "erotic", "adult film", "sex tape"];
  if (blocked.some((w) => text.includes(w))) return false;
  return true;
}

export async function getCategory(input: { data: { category: "movies" | "tv" | "cartoons"; isKids?: boolean } }) {
  const { category, isKids = false } = input.data;

  // /discover supports cert + genre filters; /tv/popular and /trending do not.
  // For kids we always route through /discover so filters are enforced server-side.
  const kidsDiscoverBase = {
    include_adult: "false",
    without_genres: ADULT_GENRES_EXCLUDE,
    certification_country: "US",
    "certification.lte": "PG",
    "vote_count.gte": "50",
  };

  if (category === "tv") {
    if (isKids) {
      // Kids TV: use /discover/tv with family/kids genre filters
      const kidsTVGenres = "10762,10751,16"; // Kids, Family, Animation
      const [popular, topRated, newShows] = await Promise.all([
        tmdbPages("/discover/tv", { ...kidsDiscoverBase, with_genres: kidsTVGenres, sort_by: "popularity.desc" }),
        tmdbPages("/discover/tv", { ...kidsDiscoverBase, with_genres: kidsTVGenres, sort_by: "vote_average.desc", "vote_count.gte": "200" }),
        tmdbPages("/discover/tv", { ...kidsDiscoverBase, with_genres: kidsTVGenres, sort_by: "first_air_date.desc" }),
      ]);
      const filterFn = (r: any) => isKidsSafe(r);
      return {
        hero: (popular.results ?? []).filter(filterFn).map((r: any) => normalize(r, "tv")).slice(0, 6),
        rows: [
          { title: "Popular Kids Shows", items: (popular.results ?? []).filter(filterFn).map((r: any) => normalize(r, "tv")) },
          { title: "Top Rated Kids Shows", items: (topRated.results ?? []).filter(filterFn).map((r: any) => normalize(r, "tv")) },
          { title: "New Kids Shows", items: (newShows.results ?? []).filter(filterFn).map((r: any) => normalize(r, "tv")) },
        ],
      };
    }
    const [popular, top, trending] = await Promise.all([
      tmdbPages("/tv/popular", { page: "1" }),
      tmdbPages("/tv/top_rated", { page: "1" }),
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
  if (category === "cartoons") {
    if (isKids) {
      // Kids cartoons: animation + family genres with strict cert filter
      const [animMovies, animTV, topRated] = await Promise.all([
        tmdbPages("/discover/movie", { ...kidsDiscoverBase, with_genres: "16,10751", sort_by: "popularity.desc" }),
        tmdbPages("/discover/tv", { ...kidsDiscoverBase, with_genres: "16,10762", sort_by: "popularity.desc" }),
        tmdbPages("/discover/movie", { ...kidsDiscoverBase, with_genres: "16", sort_by: "vote_average.desc", "vote_count.gte": "200" }),
      ]);
      const filterFn = (r: any) => isKidsSafe(r);
      return {
        hero: (animMovies.results ?? []).filter(filterFn).map((r: any) => normalize(r, "movie")).slice(0, 6),
        rows: [
          { title: "Animated Movies", items: (animMovies.results ?? []).filter(filterFn).map((r: any) => normalize(r, "movie")) },
          { title: "Animated Series", items: (animTV.results ?? []).filter(filterFn).map((r: any) => normalize(r, "tv")) },
          { title: "Top Rated Animation", items: (topRated.results ?? []).filter(filterFn).map((r: any) => normalize(r, "movie")) },
        ],
      };
    }
    // Non-kids cartoons — no cert restrictions
    const [movies, tv, trending] = await Promise.all([
      tmdbPages("/discover/movie", { with_genres: "16", sort_by: "popularity.desc", include_adult: "false" }),
      tmdbPages("/discover/tv", { with_genres: "16", sort_by: "popularity.desc", include_adult: "false" }),
      tmdbPages("/discover/movie", { with_genres: "16", sort_by: "vote_count.desc", include_adult: "false" }),
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
  if (isKids) {
    // Kids movies: use /discover so certification + genre filters are enforced
    const [popular, topRated, family, upcoming] = await Promise.all([
      tmdbPages("/discover/movie", { ...kidsDiscoverBase, sort_by: "popularity.desc" }),
      tmdbPages("/discover/movie", { ...kidsDiscoverBase, sort_by: "vote_average.desc", "vote_count.gte": "200" }),
      tmdbPages("/discover/movie", { ...kidsDiscoverBase, with_genres: "10751,16", sort_by: "popularity.desc" }),
      tmdbPages("/discover/movie", { ...kidsDiscoverBase, sort_by: "primary_release_date.desc" }),
    ]);
    const filterFn = (r: any) => isKidsSafe(r);
    return {
      hero: (popular.results ?? []).filter(filterFn).map((r: any) => normalize(r, "movie")).slice(0, 6),
      rows: [
        { title: "Popular Kids Movies", items: (popular.results ?? []).filter(filterFn).map((r: any) => normalize(r, "movie")) },
        { title: "Top Rated Kids Movies", items: (topRated.results ?? []).filter(filterFn).map((r: any) => normalize(r, "movie")) },
        { title: "Family & Animation", items: (family.results ?? []).filter(filterFn).map((r: any) => normalize(r, "movie")) },
        { title: "New Kids Movies", items: (upcoming.results ?? []).filter(filterFn).map((r: any) => normalize(r, "movie")) },
      ],
    };
  }
  const [popular, top, trending, upcoming] = await Promise.all([
    tmdbPages("/movie/popular", { page: "1" }),
    tmdbPages("/movie/top_rated", { page: "1" }),
    tmdb("/trending/movie/week", {}),
    tmdbPages("/movie/upcoming", { page: "1" }),
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
}

export async function searchContent(input: { data: { query: string } }) {
  const { query } = input.data;
  if (!query.trim()) return { results: [] as TmdbItem[] };

  const res = await tmdb("/search/multi", { query, page: "1", include_adult: "false" });
  const results = (res.results ?? [])
    .filter((r: any) => r.media_type !== "person" && (r.poster_path || r.backdrop_path))
    .map((r: any) => normalize(r));
  return { results };
}

export async function getSeasonEpisodes(input: { data: { id: number; season: number } }) {
  const { id, season } = input.data;
  const res = await tmdb(`/tv/${id}/season/${season}`, { language: "en-US" });
  return (res.episodes ?? []).map((ep: any) => ({
    episode_number: ep.episode_number as number,
    name: (ep.name && ep.name !== `Episode ${ep.episode_number}` ? ep.name : `Episode ${ep.episode_number}`) as string,
    overview: (ep.overview ?? "") as string,
    still_path: (ep.still_path ?? null) as string | null,
    runtime: (ep.runtime ?? null) as number | null,
    air_date: (ep.air_date ?? null) as string | null,
  }));
}

export async function getDetails(input: { data: { id: number; mediaType: "movie" | "tv" } }) {
  const { id, mediaType } = input.data;
  const res = await tmdb(`/${mediaType}/${id}`, { append_to_response: "videos,credits,similar" });
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
    mediaType,
    similar: (res.similar?.results ?? []).map((r: any) => normalize(r, mediaType)),
  };
}
