import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorStatsPanel } from "@/components/AuthorStatsPanel";
import { BoardPositionRow } from "@/components/BoardPositionRow";
import { ChapterListForAuthor } from "@/components/ChapterListForAuthor";
import { CoverThumb } from "@/components/CoverThumb";
import { LibraryButton } from "@/components/LibraryButton";
import { NovelBlurb } from "@/components/NovelBlurb";
import { NovelCard } from "@/components/NovelCard";
import { NovelTagList } from "@/components/NovelTagList";
import { RatingControl } from "@/components/RatingControl";
import { ReaderChapterList } from "@/components/ReaderChapterList";
import { StatusBadge } from "@/components/StatusBadge";
import { getAuthorNovelStats } from "@/lib/data/authorStats";
import { getBlockedTagIds } from "@/lib/data/blockedTags";
import { getBoardPositionsForNovel, getBoardQualifierCount } from "@/lib/data/boards";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import {
  getChaptersForNovel,
  getNovelById,
  getOtherNovelsByAuthor,
  getReaderCountForNovel,
} from "@/lib/data/novels";
import { isInLibrary } from "@/lib/data/library";
import { getLastReadChapterId } from "@/lib/data/progress";
import { getMyRatingFor, getRatingSummary } from "@/lib/data/ratings";
import { createClient } from "@/lib/supabase/server";
import { demographicLabel } from "@/lib/classification";
import { BOARD_MIN_QUALIFIERS, type BoardKey } from "@/lib/rankings";
import { getSiteUrl } from "@/lib/siteUrl";

const FALLBACK_DESCRIPTION = "A web novel on NovelTrend.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ novelId: string }>;
}): Promise<Metadata> {
  const { novelId } = await params;
  const novel = await getNovelById(novelId);
  if (!novel) return { title: "Novel not found — NovelTrend" };

  const synopsis = (novel.synopsis ?? "").trim();
  const description = synopsis.length > 0
    ? synopsis.slice(0, 200) + (synopsis.length > 200 ? "…" : "")
    : FALLBACK_DESCRIPTION;
  const authorLine = novel.authorPenName ? ` by ${novel.authorPenName}` : "";
  const title = `${novel.title}${authorLine} — NovelTrend`;
  const site = getSiteUrl();
  const canonical = `${site}/novels/${novel.id}`;
  const image = novel.cover_url ?? undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "book",
      siteName: "NovelTrend",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

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
    readerCount,
    otherByAuthor,
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
    getReaderCountForNovel(novelId),
    getOtherNovelsByAuthor(novel.author_id, novel.id, 6),
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
  const lastPublishedChapter = publishedChapters[publishedChapters.length - 1];
  const continueChapter = lastReadChapterId
    ? publishedChapters.find((c) => c.id === lastReadChapterId)
    : null;
  const nextChapterAfterProgress = continueChapter
    ? publishedChapters.find((c) => c.order_number === continueChapter.order_number + 1) ?? null
    : null;
  const lastReadOrder = continueChapter?.order_number ?? null;

  // "Newest chapter" date is the most recent publish; "first published"
  // is the earliest chapter's publish date. Both come out of the same
  // getChaptersForNovel result so no extra query.
  const publishedDates = publishedChapters
    .map((c) => (c.published_at ? new Date(c.published_at).getTime() : null))
    .filter((t): t is number => t !== null);
  const lastUpdated = publishedDates.length > 0 ? new Date(Math.max(...publishedDates)) : null;
  const firstPublished = publishedDates.length > 0 ? new Date(Math.min(...publishedDates)) : null;

  const caughtUp = Boolean(
    continueChapter && lastPublishedChapter && continueChapter.id === lastPublishedChapter.id,
  );

  const primaryAction = (() => {
    if (caughtUp && lastPublishedChapter) {
      return {
        href: `/novels/${novelId}/chapters/${lastPublishedChapter.id}`,
        label: "Re-read latest chapter",
      };
    }
    if (nextChapterAfterProgress) {
      return {
        href: `/novels/${novelId}/chapters/${nextChapterAfterProgress.id}`,
        label: "Continue reading",
      };
    }
    if (continueChapter) {
      return {
        href: `/novels/${novelId}/chapters/${continueChapter.id}`,
        label: "Continue reading",
      };
    }
    if (firstChapter) {
      return {
        href: `/novels/${novelId}/chapters/${firstChapter.id}`,
        label: "Start reading",
      };
    }
    return null;
  })();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      {blockedTagOverlap.length > 0 && (
        <p className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          This novel carries a tag you&apos;ve blocked
          {blockedTagOverlap.length === 1 ? "" : "s"} ({blockedTagOverlap.map((t) => t.name).join(", ")}), so
          it&apos;s hidden from your normal lists.
        </p>
      )}

      <section className="grid gap-6 sm:grid-cols-[minmax(0,180px)_1fr] sm:gap-8">
        <div className="max-w-[220px] sm:max-w-none">
          <CoverThumb src={novel.cover_url} title={novel.title} />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <StatusBadge status={novel.status} />
            {novel.demographic && (
              <span className="rounded-full bg-[var(--border)] px-2 py-0.5 font-medium uppercase tracking-wide">
                {demographicLabel(novel.demographic)}
              </span>
            )}
            {novel.genres.slice(0, 4).map((g) => (
              <span key={g.id}>{g.name}</span>
            ))}
          </div>

          <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">{novel.title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            by{" "}
            {novel.authorPenName ? (
              <Link href={`/authors/${novel.author_id}`} className="hover:text-[var(--foreground)] hover:underline">
                {novel.authorPenName}
              </Link>
            ) : (
              "Unknown author"
            )}
          </p>

          <BoardPositionRow positions={visiblePositions} />

          <div className="mt-4">
            <NovelBlurb synopsis={novel.synopsis} />
          </div>

          {novel.tags.length > 0 && (
            <div className="mt-4">
              <NovelTagList tags={novel.tags} />
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {primaryAction ? (
              <Link
                href={primaryAction.href}
                className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-[var(--brand-foreground)] hover:opacity-95"
              >
                {primaryAction.label}
              </Link>
            ) : (
              <span className="rounded-full border border-dashed border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
                No chapters to read yet
              </span>
            )}

            <LibraryButton
              novelId={novelId}
              initialInLibrary={inLibrary}
              isLoggedIn={Boolean(user)}
            />

            {isOwner && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
                <Link href={`/novels/${novelId}/edit`} className="hover:text-[var(--foreground)] hover:underline">
                  Edit details
                </Link>
                <Link href={`/novels/${novelId}/chapters/new`} className="hover:text-[var(--foreground)] hover:underline">
                  Add chapter
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm sm:grid-cols-4">
        <MetaCell label="Chapters" value={`${publishedChapters.length}`} />
        <MetaCell label="Readers" value={formatReaderCount(readerCount)} />
        <MetaCell label="Last updated" value={lastUpdated ? formatDate(lastUpdated) : "—"} />
        <MetaCell label="First published" value={firstPublished ? formatDate(firstPublished) : "—"} />
      </section>

      <div className="mt-6">
        <RatingControl
          novelId={novelId}
          isLoggedIn={Boolean(user)}
          isOwnNovel={isOwner}
          initialMyRating={myRating}
          initialSummary={{ ratingCount: ratingSummary.ratingCount, avgScore: ratingSummary.avgScore }}
        />
      </div>

      {isOwner && authorStats && <AuthorStatsPanel stats={authorStats} />}

      {isOwner ? (
        <ChapterListForAuthor
          novelId={novelId}
          chapters={chapters}
          volumes={volumes}
          isOwner={isOwner}
        />
      ) : (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Chapters</h2>
          <ReaderChapterList
            novelId={novelId}
            chapters={publishedChapters}
            volumes={volumes}
            lastReadOrder={lastReadOrder}
            currentChapterId={continueChapter?.id ?? null}
          />
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-6 text-sm">
        <Link
          href={`/novels/${novelId}/chapters/${firstChapter?.id ?? ""}/comments`}
          className={firstChapter ? "text-[var(--brand)] hover:underline" : "pointer-events-none text-[var(--muted)]"}
          aria-disabled={firstChapter ? undefined : true}
        >
          {firstChapter ? "Jump into a chapter to comment" : "Comments open once the first chapter is published"}
        </Link>
      </div>

      {otherByAuthor.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-lg font-semibold">
            More from {novel.authorPenName ?? "this author"}
          </h2>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {otherByAuthor.map((n) => (
              <NovelCard key={n.id} novel={n} />
            ))}
          </div>
          {novel.authorPenName && (
            <p className="mt-3 text-sm">
              <Link
                href={`/authors/${novel.author_id}`}
                className="text-[var(--brand)] hover:underline"
              >
                View all novels by {novel.authorPenName} →
              </Link>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-base font-medium tabular-nums">{value}</p>
    </div>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatReaderCount(count: number | null): string {
  if (count === null || count === 0) return "—";
  return count.toLocaleString();
}
