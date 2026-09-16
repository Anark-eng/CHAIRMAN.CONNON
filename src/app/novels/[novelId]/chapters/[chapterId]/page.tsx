import { notFound } from "next/navigation";
import { ChapterReader, type ChapterReactionData } from "@/components/ChapterReader";
import type { ReaderChapterNavItem, ReaderVolume } from "@/components/ReaderChrome";
import { getChapterCommentCount, getParagraphCommentCounts } from "@/lib/data/comments";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getChapter, getChaptersForNovel, getNovelById } from "@/lib/data/novels";
import { getMyReactionsForChapter, getReactionCountsForChapter } from "@/lib/data/reactions";
import { getSuggestionsForNovel } from "@/lib/data/suggestions";
import { assignPids, parseMarkdownParagraphs, type Paragraph } from "@/lib/chapterContent";
import { createClient } from "@/lib/supabase/server";
import type { ReactionCountsShape } from "@/lib/reactions";
import type { ReactionType } from "@/lib/supabase/database.types";

export default async function ChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ novelId: string; chapterId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { novelId, chapterId } = await params;
  const { preview } = await searchParams;
  const { user } = await getCurrentUserAndProfile();

  const [novel, chapter] = await Promise.all([getNovelById(novelId), getChapter(novelId, chapterId)]);
  if (!novel || !chapter) notFound();

  const isOwner = user?.id === novel.author_id;
  const previewMode = preview === "1" && isOwner;

  // Prefer the stored paragraphs (with pids). Fall back to splitting
  // body if this chapter somehow has no stored paragraphs — that only
  // happens on chapters that haven't been touched since the 0008
  // backfill; pids are assigned on-the-fly so reactions still key
  // consistently until the next save.
  const storedParagraphs = Array.isArray(chapter.paragraphs)
    ? (chapter.paragraphs as Paragraph[])
    : [];
  const paragraphs: Paragraph[] = storedParagraphs.length > 0
    ? storedParagraphs
    : assignPids(parseMarkdownParagraphs(chapter.body ?? ""), []);

  const supabase = await createClient();
  const [
    chapters,
    countRows,
    myReactions,
    paragraphCommentCounts,
    chapterCommentCount,
    volumeQuery,
  ] = await Promise.all([
    getChaptersForNovel(novelId, { includeDrafts: false }),
    getReactionCountsForChapter(chapter.id),
    user ? getMyReactionsForChapter(user.id, chapter.id) : Promise.resolve([]),
    getParagraphCommentCounts(chapter.id, paragraphs.map((p) => p.pid)),
    getChapterCommentCount(chapter.id),
    supabase
      .from("volumes")
      .select("id, name, position")
      .eq("novel_id", novelId)
      .order("position", { ascending: true }),
  ]);

  const volumes: ReaderVolume[] = (volumeQuery.data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    position: v.position,
  }));

  const orderedChapters = chapter.is_published
    ? chapters
    : [
        ...chapters,
        {
          id: chapter.id,
          title: chapter.title,
          order_number: chapter.order_number,
          is_published: false,
          published_at: null,
          volume_id: chapter.volume_id,
        },
      ].sort((a, b) => a.order_number - b.order_number);

  const currentIndex = orderedChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIndex > 0 ? orderedChapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex >= 0 && currentIndex < orderedChapters.length - 1 ? orderedChapters[currentIndex + 1] : null;

  const publishedOrdered = orderedChapters.filter((c) => c.is_published);
  const newestPublished = publishedOrdered[publishedOrdered.length - 1];
  const isNewestChapter = Boolean(newestPublished && newestPublished.id === chapter.id) && chapter.is_published;

  const suggestions = isNewestChapter && !previewMode
    ? await getSuggestionsForNovel(novel.id, user?.id ?? null, 3)
    : [];

  const countsByPid: Record<string, ReactionCountsShape> = {};
  for (const row of countRows) {
    countsByPid[row.paragraph_pid] = {
      shocked: row.shocked,
      heartbreak: row.heartbreak,
      laughed: row.laughed,
      goosebumps: row.goosebumps,
      best_line: row.best_line,
      confused: row.confused,
      total: row.total,
    };
  }

  const myReactionsByPid: Record<string, ReactionType[]> = {};
  for (const row of myReactions) {
    const list = myReactionsByPid[row.paragraph_pid] ?? (myReactionsByPid[row.paragraph_pid] = []);
    list.push(row.reaction_type);
  }

  const commentCountsByPid: Record<string, number> = {};
  paragraphCommentCounts.forEach((count, pid) => {
    commentCountsByPid[pid] = count;
  });

  const reactionData: ChapterReactionData = {
    countsByPid,
    myReactionsByPid,
    paragraphCommentCountsByPid: commentCountsByPid,
  };

  const toReaderNav = (c: { id: string; title: string; order_number: number; volume_id?: string | null }): ReaderChapterNavItem => ({
    id: c.id,
    title: c.title,
    order_number: c.order_number,
    volume_id: c.volume_id ?? null,
  });

  return (
    <ChapterReader
      novelId={novelId}
      novelTitle={novel.title}
      authorPenName={novel.authorPenName}
      chapterId={chapter.id}
      chapterTitle={chapter.title}
      chapterNumber={chapter.order_number}
      paragraphs={paragraphs}
      authorNoteTop={chapter.author_note_top}
      authorNoteBottom={chapter.author_note_bottom}
      prevChapter={prevChapter ? toReaderNav(prevChapter) : null}
      nextChapter={nextChapter ? toReaderNav(nextChapter) : null}
      tableOfContents={chapters.map(toReaderNav)}
      volumes={volumes}
      trackProgress={Boolean(user) && chapter.is_published && !isOwner && !previewMode}
      reactions={reactionData}
      isLoggedIn={Boolean(user)}
      chapterCommentCount={chapterCommentCount}
      isNewestChapter={isNewestChapter && !previewMode}
      novelStatus={novel.status}
      suggestions={suggestions}
      preview={previewMode}
    />
  );
}
