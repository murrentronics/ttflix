import { useQuery } from "@tanstack/react-query";
import { getCategory } from "@/lib/tmdb.functions";
import { AppShell } from "./AppShell";
import { Browse } from "./Browse";

export function CategoryView({
  category,
  heading,
}: {
  category: "movies" | "tv" | "cartoons";
  heading: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["category", category],
    queryFn: () => getCategory({ data: { category } }),
  });

  return (
    <AppShell>
      {isLoading || !data ? (
        <div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">
          Loading {heading}…
        </div>
      ) : (
        <Browse feed={data} />
      )}
    </AppShell>
  );
}
