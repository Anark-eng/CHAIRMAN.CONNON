import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorStatsPanel } from "@/components/AuthorStatsPanel";
import { BoardPositionRow } from "@/components/BoardPositionRow";
import { ChapterListForAuthor } from "@/components/ChapterListForAuthor";
import { CoverThumb } from "@/components/CoverThumb";
import { RatingControl } from "@/components/RatingControl";
import { StatusBadge } from "@/components/StatusBadge";
import { addToLibrary, removeFromLibrary } from "@/lib/actions/library";
import { getAuthorNovelStats } from "@/lib/data/authorStats";
import { getBlockedTagIds } from "@/lib/data/blockedTags";
import { getBoardPositionsForNovel, getBoardQualifierCount } from "@/lib/data/boards";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getChaptersForNovel, getNovelById } from "@/lib/data/novels";
import { isInLibrary } from "@/lib/data/library";
import { getLastReadChapterId } from "@/lib/data/progress";
import { getMyRatingFor, getRatingSummary } from "@/lib/data/ratings";
import { createClient } from "@/lib/supabase/server";
import { demographicLabel } from "@/lib/classification";
import { BOARD_MIN_QUALIFIERS, type BoardKey } from "@/lib/rankings";

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

  const supabase = await createClient();
  const [
    chapters,
    inLibrary,
    lastReadChapterId,
    blockedTagIds,
    authorStats,
    ratingSummary,
    myRating,
    positions,
    boardCounts,
    volumeQueryResult,
  ] = await Promise.all([
    getChaptersForNovel(novelId, { includeDrafts: isOwner }),
    user ? isInLibrary(user.id, novelId) : Promise.resolve(false),
    user ? getLastReadChapterId(user.id, novelId) : Promise.resolve(null),
    getBlockedTagIds(user?.id ?? null),
    isOwner ? getAuthorNovelStats(novelId) : Promise.resolve(null),
    getRatingSummary(novelId),
    getMyRatingFor(user?.id ?? null, novelId),
    getBoardPositionsForNovel(novelId),
    Promise.all([
      getBoardQualifierCount("trending"),
      getBoardQualifierCount("top_rated"),
      getBoardQualifierCount("most_read"),
    ]).then(([trending, top_rated, most_read]) => ({ trending, top_rated, most_read })),
    supabase
      .from("volumes")
      .select("id, name, position")
      .eq("novel_id", novelId)
      .order("position", { ascending: true }),
  ]);
  const volumes = (volumeQueryResult.data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    position: v.position,
  }));

  // A per-board position badge is only shown when THAT board is live
  // under the 10-qualifier rule.
  const visiblePositions = (["trending", "top_rated", "most_read"] as BoardKey[])
    .filter((b) => boardCounts[b] >= BOARD_MIN_QUALIFIERS && positions[b] !== null)
    .map((b) => ({ board: b, rank: positions[b] as number }));

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

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={novel.status} />
            {novel.demographic && (
              <span className="rounded-full bg-[var(--border)] px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                {demographicLabel(novel.demographic)}
              </span>
            )}
            {novel.genres.map((g) => (
              <span key={g.id} className="text-sm text-[var(--muted)]">
                {g.name}
              </span>
            ))}
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

          <BoardPositionRow positions={visiblePositions} />

          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{novel.synopsis}</p>

          <div className="mt-5">
            <RatingControl
              novelId={novelId}
              isLoggedIn={Boolean(user)}
              isOwnNovel={isOwner}
              initialMyRating={myRating}
              initialSummary={{ ratingCount: ratingSummary.ratingCount, avgScore: ratingSummary.avgScore }}
            />
          </div>

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

      {isOwner && authorStats && <AuthorStatsPanel stats={authorStats} />}

      <ChapterListForAuthor
        novelId={novelId}
        chapters={chapters}
        volumes={volumes}
        isOwner={isOwner}
      />
    </div>
  );
}
