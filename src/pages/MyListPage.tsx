import { useState } from "react";
import { Link } from "react-router-dom";
import { X, Star } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";
import { fetchMyList, removeFromList } from "@/lib/mylist";
import { useDetail } from "@/components/DetailContext";
import { AppShell } from "@/components/AppShell";
import { img } from "@/lib/tmdb";

export function MyListPage() {
  const { user, loading } = useAuth();
  const { activeProfile } = useProfile();
  const { open } = useDetail();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-list", user?.id, activeProfile?.id],
    queryFn: () => fetchMyList(user!.id, activeProfile!.id),
    enabled: !!user && !!activeProfile,
  });

  const handleRemove = async (e: React.MouseEvent, tmdbId: number, mediaType: string) => {
    e.stopPropagation();
    if (!user || !activeProfile) return;
    await removeFromList(user.id, activeProfile.id, tmdbId, mediaType);
    queryClient.invalidateQueries({ queryKey: ["my-list", user.id, activeProfile.id] });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8">
        <h1 className="mb-6 text-3xl font-extrabold">My List</h1>
        {!loading && !user && (
          <p className="text-muted-foreground">Please <Link to="/auth" className="text-primary underline">sign in</Link> to build your list.</p>
        )}
        {user && isLoading && <p className="text-muted-foreground">Loading…</p>}
        {user && data && data.length === 0 && <p className="text-muted-foreground">Your list is empty. Add titles from any movie or show.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {data?.map((item) => (
            <div
              key={`${item.media_type}-${item.tmdb_id}`}
              className="relative overflow-hidden rounded-md bg-card transition hover:scale-105"
            >
              <button
                onClick={() => open({ id: item.tmdb_id, mediaType: item.media_type })}
                className="block w-full text-left"
              >
                <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
                  {item.poster_path
                    ? <img src={img(item.poster_path)} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                    : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{item.title}</div>
                  }
                </div>
                <div className="px-1.5 py-2">
                  <p className="line-clamp-1 text-xs font-semibold text-foreground">{item.title}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {item.vote_average != null && item.vote_average > 0 && (
                      <span className="flex items-center gap-1 text-primary">
                        <Star className="h-3 w-3 fill-primary" />
                        {item.vote_average.toFixed(1)}
                      </span>
                    )}
                    <span className="rounded border border-border px-1 py-0.5 text-[10px] uppercase">
                      {item.media_type}
                    </span>
                  </div>
                </div>
              </button>

              {/* Remove button — black square flush top-right, matching ContinueWatchingRow */}
              <button
                onClick={(e) => handleRemove(e, item.tmdb_id, item.media_type)}
                className="absolute right-0 top-0 z-10 flex items-center justify-center bg-black"
                aria-label="Remove from list"
                style={{
                  width: 32,
                  height: 32,
                  borderBottomLeftRadius: 8,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
