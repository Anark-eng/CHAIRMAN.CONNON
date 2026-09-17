import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NovelCard } from "@/components/NovelCard";
import { getAuthorPenName, getNovelsByAuthor } from "@/lib/data/novels";
import { loadBlocklist } from "@/lib/data/blockedTags";
import { getCurrentUserAndProfile } from "@/lib/data/profile";

// Minimal author page. Pen name + this author's published novels and
// nothing else. There is no author bio, no author-dashboard content
// and no author-only stats here — those live where they belong (My
// Novels, and the "Only you can see this" panel on the novel page).
// The page exists solely so links from the novel page's "by <Pen Name>"
// label resolve to something honest instead of leading nowhere.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ authorId: string }>;
}): Promise<Metadata> {
  const { authorId } = await params;
  const penName = await getAuthorPenName(authorId);
  const displayName = penName ?? "Unknown author";
  return {
    title: `${displayName} — NovelTrend`,
    description: `Novels by ${displayName} on NovelTrend.`,
  };
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ authorId: string }>;
}) {
  const { authorId } = await params;
  const { user } = await getCurrentUserAndProfile();

  const [penName, novels, blocklist] = await Promise.all([
    getAuthorPenName(authorId),
    getNovelsByAuthor(authorId),
    loadBlocklist(user?.id ?? null),
  ]);

  if (!penName && novels.length === 0) notFound();

  // Apply the reader's blocklist to the visible list. Direct novel-page
  // links still work (with the existing quiet notice) even for blocked
  // ones — this just keeps the author page consistent with other lists.
  const visibleNovels = novels.filter((n) => !blocklist.excludedNovelIds.has(n.id));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Author</p>
        <h1 className="mt-1 text-2xl font-semibold">{penName ?? "Unknown author"}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {novels.length} published novel{novels.length === 1 ? "" : "s"}
        </p>
      </header>

      {visibleNovels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Nothing to show here yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {visibleNovels.map((n) => (
            <NovelCard key={n.id} novel={n} />
          ))}
        </div>
      )}
    </div>
  );
}
