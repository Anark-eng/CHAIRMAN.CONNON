import Link from "next/link";
import { NovelCard } from "@/components/NovelCard";
import { loadBlocklist } from "@/lib/data/blockedTags";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getNewlyAddedNovels, getRecentlyUpdatedNovels, getTrendingNovels } from "@/lib/data/novels";
import { getRatingSummariesFor } from "@/lib/data/ratings";
import type { NovelCardData } from "@/lib/data/types";

export default async function HomePage() {
  const { user } = await getCurrentUserAndProfile();
  const { excludedNovelIds } = await loadBlocklist(user?.id ?? null);

  const [trending, recentlyUpdated, newlyAdded] = await Promise.all([
    getTrendingNovels(12, { excludedNovelIds }),
    getRecentlyUpdatedNovels(12, { excludedNovelIds }),
    getNewlyAddedNovels(12, { excludedNovelIds }),
  ]);

  const allIds = [...trending, ...recentlyUpdated, ...newlyAdded].map((n) => n.id);
  const ratings = await getRatingSummariesFor(Array.from(new Set(allIds)));

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-8">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
        <h1 className="text-3xl font-semibold text-[var(--brand)]">NovelTrend</h1>
        <p className="mx-auto mt-2 max-w-xl text-[var(--muted)]">
          Read web novels chapter by chapter, or turn on Author Mode and publish your own.
        </p>
        <Link
          href="/browse"
          className="mt-5 inline-block rounded-full bg-[var(--brand)] px-5 py-2 font-medium text-[var(--brand-foreground)]"
        >
          Browse novels
        </Link>
      </section>

      <NovelSection
        title="Trending this week"
        subtitle="Ranked by how fast a novel is growing, not by lifetime reads."
        novels={trending}
        ratings={ratings}
        emptyText="Nothing has picked up steam yet."
      />
      <NovelSection title="Recently updated" novels={recentlyUpdated} ratings={ratings} />
      <NovelSection title="Newly added" novels={newlyAdded} ratings={ratings} />
    </div>
  );
}

function NovelSection({
  title,
  subtitle,
  novels,
  ratings,
  emptyText = "Nothing here yet.",
}: {
  title: string;
  subtitle?: string;
  novels: NovelCardData[];
  ratings: Awaited<ReturnType<typeof getRatingSummariesFor>>;
  emptyText?: string;
}) {
  if (novels.length === 0) {
    return (
      <section>
        <h2 className="mb-1 text-xl font-semibold">{title}</h2>
        {subtitle && <p className="mb-3 text-sm text-[var(--muted)]">{subtitle}</p>}
        <p className="text-[var(--muted)]">{emptyText}</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold">{title}</h2>
      {subtitle && <p className="mb-4 text-sm text-[var(--muted)]">{subtitle}</p>}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {novels.map((novel) => (
          <NovelCard
            key={novel.id}
            novel={novel}
            extras={{ rating: ratings.get(novel.id) }}
          />
        ))}
      </div>
    </section>
  );
}
