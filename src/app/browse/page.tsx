import Link from "next/link";
import { BrowseControls } from "@/components/BrowseControls";
import { NovelCard } from "@/components/NovelCard";
import { loadBlocklist } from "@/lib/data/blockedTags";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getGenres, getGroupedApprovedTags } from "@/lib/data/taxonomy";
import { searchNovels, type SearchSort, SEARCH_SORTS } from "@/lib/data/novels";
import type { Demographic } from "@/lib/classification";
import type { NovelStatus } from "@/lib/data/types";

function parseSort(raw: string | undefined): SearchSort {
  const known = new Set<string>(SEARCH_SORTS.map((s) => s.value));
  if (raw && known.has(raw)) return raw as SearchSort;
  // Default sort is Trending — surfaces what's catching on rather
  // than raw newest, which is noisy on a site with few novels.
  return "trending";
}

function parseCsv(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

function parseStatuses(raw: string | undefined): NovelStatus[] {
  const valid: NovelStatus[] = ["ongoing", "completed", "hiatus"];
  return parseCsv(raw).filter((s): s is NovelStatus => (valid as string[]).includes(s));
}

function parseDemographic(raw: string | undefined): Demographic | null {
  const valid: Demographic[] = ["shounen", "shoujo", "seinen", "josei", "general"];
  return raw && (valid as string[]).includes(raw) ? (raw as Demographic) : null;
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    genre?: string;
    demographic?: string;
    status?: string;
    include?: string;
    exclude?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const genreSlugs = parseCsv(params.genre);
  const demographic = parseDemographic(params.demographic);
  const statuses = parseStatuses(params.status);
  const includeTagSlugs = parseCsv(params.include);
  const excludeTagSlugs = parseCsv(params.exclude);
  const sort = parseSort(params.sort);

  const { user } = await getCurrentUserAndProfile();
  const { excludedNovelIds } = await loadBlocklist(user?.id ?? null);

  const [genres, groupedTags, novels] = await Promise.all([
    getGenres(),
    getGroupedApprovedTags(12),
    searchNovels({
      query,
      genreSlugs,
      demographic,
      statuses,
      includeTagSlugs,
      excludeTagSlugs,
      sort,
      excludedNovelIds,
    }),
  ]);

  const hasAnyFilter =
    query.length > 0 ||
    genreSlugs.length > 0 ||
    demographic !== null ||
    statuses.length > 0 ||
    includeTagSlugs.length > 0 ||
    excludeTagSlugs.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <h1 className="mb-4 text-2xl font-semibold">Browse</h1>

      <BrowseControls
        query={query}
        sort={sort}
        genres={genres}
        groupedTags={groupedTags}
        genreSlugs={genreSlugs}
        demographic={demographic ?? ""}
        statuses={statuses}
        includeSlugs={includeTagSlugs}
        excludeSlugs={excludeTagSlugs}
      />

      {novels.length === 0 ? (
        <EmptyResults hasFilters={hasAnyFilter} query={query} />
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {novels.map((novel) => (
            <NovelCard key={novel.id} novel={novel} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyResults({ hasFilters, query }: { hasFilters: boolean; query: string }) {
  if (!hasFilters) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
        <p className="text-sm text-[var(--muted)]">
          No novels here yet. Once authors start publishing, they&apos;ll show up here.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
      <p className="text-sm font-medium">
        {query.length > 0
          ? `No novels match “${query}” with those filters.`
          : "No novels match those filters."}
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Try loosening a filter or two — remove a required tag or an excluded one, or
        broaden the status list.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          href="/browse"
          className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand-foreground)]"
        >
          Clear all filters
        </Link>
        <Link
          href="/rankings"
          className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-medium hover:text-[var(--foreground)]"
        >
          See Rankings instead
        </Link>
      </div>
    </div>
  );
}
