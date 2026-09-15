import Link from "next/link";
import { NovelCard } from "@/components/NovelCard";
import { TagFilterBar } from "@/components/TagFilterBar";
import { loadBlocklist } from "@/lib/data/blockedTags";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getGenres, getTags } from "@/lib/data/taxonomy";
import { searchNovels, type SearchSort } from "@/lib/data/novels";

function parseSort(raw: string | undefined): SearchSort {
  return raw === "trending" ? "trending" : "newest";
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; genre?: string; include?: string; exclude?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const genreSlug = params.genre ?? "";
  const includeTagSlugs = (params.include ?? "").split(",").filter(Boolean);
  const excludeTagSlugs = (params.exclude ?? "").split(",").filter(Boolean);
  const sort = parseSort(params.sort);

  const { user } = await getCurrentUserAndProfile();
  const { excludedNovelIds } = await loadBlocklist(user?.id ?? null);

  const [genres, tags, novels] = await Promise.all([
    getGenres(),
    getTags(),
    searchNovels({
      query,
      genreSlug: genreSlug || undefined,
      includeTagSlugs,
      excludeTagSlugs,
      sort,
      excludedNovelIds,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Browse</h1>

      <form className="mb-4 flex flex-wrap gap-3" action="/browse">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by title"
          className="flex-1 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
        <select
          name="genre"
          defaultValue={genreSlug}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        >
          <option value="">All genres</option>
          {genres.map((genre) => (
            <option key={genre.id} value={genre.slug}>
              {genre.name}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={sort}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        >
          <option value="newest">Newest first</option>
          <option value="trending">Trending</option>
        </select>
        {includeTagSlugs.length > 0 && <input type="hidden" name="include" value={includeTagSlugs.join(",")} />}
        {excludeTagSlugs.length > 0 && <input type="hidden" name="exclude" value={excludeTagSlugs.join(",")} />}
        <button
          type="submit"
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)]"
        >
          Search
        </button>
      </form>

      <div className="mb-8">
        <p className="mb-2 text-sm text-[var(--muted)]">
          Tap a tag to require it, tap again to exclude it, tap once more to clear it.
        </p>
        <TagFilterBar tags={tags} />
      </div>

      {novels.length === 0 ? (
        <p className="text-[var(--muted)]">
          No novels match those filters.{" "}
          <Link href="/browse" className="text-[var(--brand)]">
            Clear filters
          </Link>
        </p>
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
