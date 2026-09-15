import { notFound } from "next/navigation";
import { ChapterReader, type ChapterReactionData } from "@/components/ChapterReader";
import { getChapterCommentCount, getParagraphCommentCounts } from "@/lib/data/comments";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getChapter, getChaptersForNovel, getNovelById } from "@/lib/data/novels";
import { getMyReactionsForChapter, getReactionCountsForChapter } from "@/lib/data/reactions";
import { getSuggestionsForNovel } from "@/lib/data/suggestions";
import { splitParagraphs } from "@/lib/reading";
import type { ReactionCountsShape } from "@/lib/reactions";
import type { ReactionType } from "@/lib/supabase/database.types";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ novelId: string; chapterId: string }>;
}) {
  const { novelId, chapterId } = await params;
  const { user } = await getCurrentUserAndProfile();

  const [novel, chapter] = await Promise.all([getNovelById(novelId), getChapter(novelId, chapterId)]);
  if (!novel || !chapter) notFound();

  const isOwner = user?.id === novel.author_id;
  const paragraphs = splitParagraphs(chapter.body);

  const [chapters, countRows, myReactions, paragraphCommentCounts, chapterCommentCount] = await Promise.all([
    getChaptersForNovel(novelId, { includeDrafts: false }),
    getReactionCountsForChapter(chapter.id),
    user ? getMyReactionsForChapter(user.id, chapter.id) : Promise.resolve([]),
    getParagraphCommentCounts(chapter.id, paragraphs.map((p) => p.index)),
    getChapterCommentCount(chapter.id),
  ]);

  const orderedChapters = chapter.is_published
    ? chapters
    : [...chapters, { id: chapter.id, title: chapter.title, order_number: chapter.order_number, is_published: false, published_at: null }]
        .sort((a, b) => a.order_number - b.order_number);

  const currentIndex = orderedChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIndex > 0 ? orderedChapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex >= 0 && currentIndex < orderedChapters.length - 1 ? orderedChapters[currentIndex + 1] : null;

  // The caught-up card only makes sense on the newest PUBLISHED chapter --
  // never on a draft the author is previewing, and never on an earlier
  // chapter (where the next-chapter button belongs instead).
  const publishedOrdered = orderedChapters.filter((c) => c.is_published);
  const newestPublished = publishedOrdered[publishedOrdered.length - 1];
  const isNewestChapter = Boolean(newestPublished && newestPublished.id === chapter.id) && chapter.is_published;

  const suggestions = isNewestChapter
    ? await getSuggestionsForNovel(novel.id, user?.id ?? null, 3)
    : [];

  const countsByIndex: Record<number, ReactionCountsShape> = {};
  for (const row of countRows) {
    countsByIndex[row.paragraph_index] = {
      shocked: row.shocked,
      heartbreak: row.heartbreak,
      laughed: row.laughed,
      goosebumps: row.goosebumps,
      best_line: row.best_line,
      confused: row.confused,
      total: row.total,
    };
  }

  const myReactionsByIndex: Record<number, ReactionType[]> = {};
  for (const row of myReactions) {
    const list = myReactionsByIndex[row.paragraph_index] ?? (myReactionsByIndex[row.paragraph_index] = []);
    list.push(row.reaction_type);
  }

  const commentCountsByIndex: Record<number, number> = {};
  paragraphCommentCounts.forEach((count, idx) => {
    commentCountsByIndex[idx] = count;
  });

  const reactionData: ChapterReactionData = {
    countsByIndex,
    myReactionsByIndex,
    paragraphCommentCounts: commentCountsByIndex,
  };

  return (
    <ChapterReader
      novelId={novelId}
      novelTitle={novel.title}
      chapterId={chapter.id}
      chapterTitle={chapter.title}
      paragraphs={paragraphs}
      prevChapter={prevChapter}
      nextChapter={nextChapter}
      tableOfContents={chapters}
      trackProgress={Boolean(user) && chapter.is_published && !isOwner}
      reactions={reactionData}
      isLoggedIn={Boolean(user)}
      chapterCommentCount={chapterCommentCount}
      isNewestChapter={isNewestChapter}
      novelStatus={novel.status}
      suggestions={suggestions}
    />
  );
}
