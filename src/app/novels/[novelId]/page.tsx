import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverThumb } from "@/components/CoverThumb";
import { StatusBadge } from "@/components/StatusBadge";
import { addToLibrary, removeFromLibrary } from "@/lib/actions/library";
import { getBlockedTagIds } from "@/lib/data/blockedTags";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getChaptersForNovel, getNovelById } from "@/lib/data/novels";
import { isInLibrary } from "@/lib/data/library";
import { getLastReadChapterId } from "@/lib/data/progress";

export default async function NovelPage({
  params,
}: {
  params: Promise<{ novelId: string }>;
}) {
  const { novelId } = await params;
  const { user } = await getCurrentUserAndProfile();

  const novel = await getNovelById(novelId);
  if (!novel) notFound();

  const isOwner = user?.id === novel.author_id;

  const [chapters, inLibrary, lastReadChapterId, blockedTagIds] = await Promise.all([
    getChaptersForNovel(novelId, { includeDrafts: isOwner }),
    user ? isInLibrary(user.id, novelId) : Promise.resolve(false),
    user ? getLastReadChapterId(user.id, novelId) : Promise.resolve(null),
    getBlockedTagIds(user?.id ?? null),
  ]);

  // Direct links to a blocked-tag novel still work — we just show a
  // quiet notice at the top so the reader knows why it isn't turning up
  // in their normal lists.
  const blockedTagOverlap = novel.tags.filter((t) => blockedTagIds.includes(t.id));

  const publishedChapters = chapters.filter((c) => c.is_published);
  const firstChapter = publishedChapters[0];
  const continueChapter = lastReadChapterId
    ? publishedChapters.find((c) => c.id === lastReadChapterId)
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {blockedTagOverlap.length > 0 && (
        <p className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          This novel carries a tag you&apos;ve blocked
          {blockedTagOverlap.length === 1 ? "" : "s"} ({blockedTagOverlap.map((t) => t.name).join(", ")}), so
          it&apos;s hidden from your normal lists.
        </p>
      )}
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-40 shrink-0">
          <CoverThumb src={novel.cover_url} title={novel.title} />
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{novel.title}</h1>
          <p className="mt-1 text-[var(--muted)]">by {novel.authorPenName ?? "Unknown author"}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={novel.status} />
            {novel.genre && <span className="text-sm text-[var(--muted)]">{novel.genre.name}</span>}
          </div>

          {novel.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {novel.tags.map((tag) => (
                <span key={tag.id} className="rounded-full bg-[var(--border)] px-2.5 py-0.5 text-xs">
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{novel.synopsis}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {continueChapter ? (
              <Link
                href={`/novels/${novelId}/chapters/${continueChapter.id}`}
                className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)]"
              >
                Continue reading
              </Link>
            ) : (
              firstChapter && (
                <Link
                  href={`/novels/${novelId}/chapters/${firstChapter.id}`}
                  className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)]"
                >
                  Start reading
                </Link>
              )
            )}

            {user ? (
              <form action={(inLibrary ? removeFromLibrary : addToLibrary).bind(null, novelId)}>
                <button
                  type="submit"
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium"
                >
                  {inLibrary ? "Remove from library" : "Add to library"}
                </button>
              </form>
            ) : (
              <Link href="/login" className="text-sm text-[var(--muted)] underline">
                Log in to add to your library
              </Link>
            )}

            {isOwner && (
              <>
                <Link href={`/novels/${novelId}/edit`} className="text-sm text-[var(--muted)]">
                  Edit details
                </Link>
                <Link href={`/novels/${novelId}/chapters/new`} className="text-sm text-[var(--muted)]">
                  Add chapter
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Chapters</h2>
        {chapters.length === 0 ? (
          <p className="text-[var(--muted)]">No chapters yet.</p>
        ) : (
          <ol className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {chapters.map((chapter) => (
              <li key={chapter.id} className="flex items-center justify-between px-4 py-3">
                <Link
                  href={`/novels/${novelId}/chapters/${chapter.id}`}
                  className="hover:text-[var(--brand)]"
                >
                  {chapter.order_number}. {chapter.title}
                </Link>
                <div className="flex items-center gap-3">
                  {!chapter.is_published && (
                    <span className="text-xs font-medium text-amber-600">Draft</span>
                  )}
                  {isOwner && (
                    <Link
                      href={`/novels/${novelId}/chapters/${chapter.id}/edit`}
                      className="text-xs text-[var(--muted)]"
                    >
                      Edit
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
