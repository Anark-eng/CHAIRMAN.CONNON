import { notFound } from "next/navigation";
import { ChapterReader } from "@/components/ChapterReader";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getChapter, getChaptersForNovel, getNovelById } from "@/lib/data/novels";
import { splitParagraphs } from "@/lib/reading";

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
  const chapters = await getChaptersForNovel(novelId, { includeDrafts: false });

  const orderedChapters = chapter.is_published
    ? chapters
    : [...chapters, { id: chapter.id, title: chapter.title, order_number: chapter.order_number, is_published: false, published_at: null }]
        .sort((a, b) => a.order_number - b.order_number);

  const currentIndex = orderedChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIndex > 0 ? orderedChapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex >= 0 && currentIndex < orderedChapters.length - 1 ? orderedChapters[currentIndex + 1] : null;

  return (
    <ChapterReader
      novelId={novelId}
      novelTitle={novel.title}
      chapterId={chapter.id}
      chapterTitle={chapter.title}
      paragraphs={splitParagraphs(chapter.body)}
      prevChapter={prevChapter}
      nextChapter={nextChapter}
      tableOfContents={chapters}
      trackProgress={Boolean(user) && chapter.is_published && !isOwner}
    />
  );
}
