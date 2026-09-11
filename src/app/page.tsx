import Link from "next/link";
import { NovelCard } from "@/components/NovelCard";
import { getNewlyAddedNovels, getRecentlyUpdatedNovels } from "@/lib/data/novels";

export default async function HomePage() {
  const [recentlyUpdated, newlyAdded] = await Promise.all([
    getRecentlyUpdatedNovels(12),
    getNewlyAddedNovels(12),
  ]);

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

      <NovelSection title="Recently updated" novels={recentlyUpdated} />
      <NovelSection title="Newly added" novels={newlyAdded} />
    </div>
  );
}

function NovelSection({ title, novels }: { title: string; novels: Awaited<ReturnType<typeof getNewlyAddedNovels>> }) {
  if (novels.length === 0) {
    return (
      <section>
        <h2 className="mb-4 text-xl font-semibold">{title}</h2>
        <p className="text-[var(--muted)]">Nothing here yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {novels.map((novel) => (
          <NovelCard key={novel.id} novel={novel} />
        ))}
      </div>
    </section>
  );
}
