import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchMyList } from "@/lib/mylist";
import { useDetail } from "@/components/DetailContext";
import { AppShell } from "@/components/AppShell";
import { img } from "@/lib/tmdb";

export const Route = createFileRoute("/my-list")({
  head: () => ({ meta: [{ title: "My List — TTFlix" }] }),
  component: MyListPage,
});

function MyListPage() {
  const { user, loading } = useAuth();
  const { open } = useDetail();

  const { data, isLoading } = useQuery({
    queryKey: ["my-list", user?.id],
    queryFn: () => fetchMyList(user!.id),
    enabled: !!user,
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8">
        <h1 className="mb-6 text-3xl font-extrabold">My List</h1>

        {!loading && !user && (
          <p className="text-muted-foreground">
            Please{" "}
            <Link to="/auth" className="text-primary underline">
              sign in
            </Link>{" "}
            to build your list.
          </p>
        )}

        {user && isLoading && <p className="text-muted-foreground">Loading…</p>}
        {user && data && data.length === 0 && (
          <p className="text-muted-foreground">Your list is empty. Add titles from any movie or show.</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {data?.map((item) => (
            <button
              key={`${item.media_type}-${item.tmdb_id}`}
              onClick={() => open({ id: item.tmdb_id, mediaType: item.media_type })}
              className="overflow-hidden rounded-md bg-card transition hover:scale-105"
            >
              <div className="aspect-[2/3] bg-muted">
                {item.poster_path ? (
                  <img src={img(item.poster_path)} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs">
                    {item.title}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
