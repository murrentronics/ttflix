import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { X, Play, Plus, Check, Star, Lock } from "lucide-react";
import { useDetail } from "./DetailContext";
import { useAuth } from "@/lib/auth";
import { getDetails, type TmdbItem } from "@/lib/tmdb.functions";
import { addToList, removeFromList, fetchMyList } from "@/lib/mylist";
import { img, year } from "@/lib/tmdb";
import { MovieCard } from "./MovieCard";

export function DetailModal() {
  const { current, close } = useDetail();
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [inList, setInList] = useState(false);

  const canWatch = isAdmin || (!!user && profile?.status === "approved");

  const { data, isLoading } = useQuery({
    queryKey: ["details", current?.mediaType, current?.id],
    queryFn: () => getDetails({ data: { id: current!.id, mediaType: current!.mediaType } }),
    enabled: !!current,
  });

  useEffect(() => {
    if (!current || !user) {
      setInList(false);
      return;
    }
    fetchMyList(user.id).then((list) =>
      setInList(list.some((l) => l.tmdb_id === current.id && l.media_type === current.mediaType)),
    );
  }, [current, user]);

  useEffect(() => {
    if (current) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [current]);

  if (!current) return null;

  const toggleList = async () => {
    if (!user || !data) {
      navigate({ to: "/auth" });
      return;
    }
    if (inList) {
      await removeFromList(user.id, current.id, current.mediaType);
      setInList(false);
    } else {
      await addToList({
        user_id: user.id,
        tmdb_id: current.id,
        media_type: current.mediaType,
        title: data.title,
        poster_path: data.poster_path,
      });
      setInList(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 py-10 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 transition hover:bg-black/80"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative aspect-video w-full bg-muted">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
          ) : data?.trailerKey ? (
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${data.trailerKey}?rel=0`}
              title="Trailer"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <img
              src={img(data?.backdrop_path, "w780")}
              alt={data?.title}
              className="h-full w-full object-cover"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        </div>

        {data && (
          <div className="space-y-4 p-5 sm:p-7">
            <h2 className="text-2xl font-extrabold sm:text-3xl">{data.title}</h2>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 text-primary">
                <Star className="h-4 w-4 fill-primary" /> {data.vote_average.toFixed(1)}
              </span>
              <span>{year(data.release_date)}</span>
              {data.runtime ? <span>{data.runtime} min</span> : null}
              {data.number_of_seasons ? <span>{data.number_of_seasons} seasons</span> : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  close();
                  if (!canWatch) {
                    navigate({ to: "/" });
                    return;
                  }
                  navigate({
                    to: "/watch/$mediaType/$id",
                    params: { mediaType: current.mediaType, id: String(current.id) },
                    search: {
                      title: data.title,
                      poster: data.poster_path ?? "",
                      backdrop: data.backdrop_path ?? "",
                      season: 1,
                      episode: 1,
                    },
                  });
                }}
                className="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/85"
              >
                {canWatch ? (
                  <Play className="h-5 w-5 fill-current" />
                ) : (
                  <Lock className="h-5 w-5" />
                )}
                {canWatch ? "Play" : "Unlock"}
              </button>
              <button
                onClick={toggleList}
                className="flex items-center gap-2 rounded-md bg-secondary px-5 py-2.5 font-semibold transition hover:bg-accent"
              >
                {inList ? <Check className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5" />}
                {inList ? "In My List" : "My List"}
              </button>
            </div>

            <p className="text-sm leading-relaxed text-foreground/85">{data.overview}</p>

            {data.genres.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground">Genres：</span> {data.genres.join(", ")}
              </p>
            )}
            {data.cast.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground">Cast：</span> {data.cast.join(", ")}
              </p>
            )}

            {data.similar.length > 0 && (
              <div>
                <h3 className="mb-3 text-lg font-bold">More Like This</h3>
                <div className="row-scroll flex gap-3 overflow-x-auto pb-2">
                  {data.similar.slice(0, 10).map((s: TmdbItem) => (
                    <MovieCard key={`${s.media_type}-${s.id}`} item={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
