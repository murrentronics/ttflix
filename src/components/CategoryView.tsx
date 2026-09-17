import { useQuery } from "@tanstack/react-query";
import { getCategory } from "@/lib/tmdb.functions.app";
import { useProfile } from "@/lib/ProfileContext";
import { AppShell } from "./AppShell";
import { Browse } from "./Browse";
import { CatalogStatus, CATALOG_QUERY_OPTIONS } from "./CatalogStatus";

export function CategoryView({
  category,
  heading,
}: {
  category: "movies" | "tv" | "cartoons";
  heading: string;
}) {
  const { activeProfile } = useProfile();
  const isKids = activeProfile?.is_kids ?? false;

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["category", category, isKids],
    queryFn: () => getCategory({ data: { category, isKids } }),
    ...CATALOG_QUERY_OPTIONS,
  });

  return (
    <AppShell>
      {isLoading || !data ? (
        <CatalogStatus
          label={heading}
          isError={isError}
          isFetching={isFetching}
          onRefresh={() => refetch()}
        />
      ) : (
        <Browse feed={data} />
      )}
    </AppShell>
  );
}
