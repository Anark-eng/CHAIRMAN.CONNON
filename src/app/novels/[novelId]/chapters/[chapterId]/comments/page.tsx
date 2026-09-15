import Link from "next/link";
import { notFound } from "next/navigation";
import { ChapterCommentThread } from "@/components/ChapterCommentThread";
import { CommentForm } from "@/components/CommentForm";
import { LoginPromptCard } from "@/components/LoginPromptCard";
import { addChapterComment } from "@/lib/actions/comments";
import { getChapterCommentsThreaded } from "@/lib/data/comments";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getChapter, getNovelById } from "@/lib/data/novels";

export default async function ChapterCommentsPage({
  params,
}: {
  params: Promise<{ novelId: string; chapterId: string }>;
}) {
  const { novelId, chapterId } = await params;
  const [novel, chapter, { user }] = await Promise.all([
    getNovelById(novelId),
    getChapter(novelId, chapterId),
    getCurrentUserAndProfile(),
  ]);
  if (!novel || !chapter) notFound();

  const threads = await getChapterCommentsThreaded(chapterId);
  const isNovelAuthor = user?.id === novel.author_id;

  const submit = addChapterComment.bind(null, novelId, chapterId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <p className="mb-1 text-sm text-[var(--muted)]">
        <Link href={`/novels/${novelId}/chapters/${chapterId}`} className="hover:text-[var(--brand)]">
          &larr; Back to {chapter.title}
        </Link>
      </p>
      <h1 className="mb-6 text-xl font-semibold">Chapter comments</h1>

      {user ? (
        <div className="mb-8">
          <CommentForm action={submit} placeholder={`Share your thoughts on ${chapter.title}…`} />
        </div>
      ) : (
        <LoginPromptCard message="Log in to comment on this chapter." />
      )}

      <h2 className="mb-3 text-lg font-semibold">
        {threads.length === 0 ? "No comments yet" : `${threads.length} thread${threads.length === 1 ? "" : "s"}`}
      </h2>

      {threads.length > 0 && (
        <ul className="space-y-4">
          {threads.map((thread) => (
            <ChapterCommentThread
              key={thread.id}
              thread={thread}
              novelId={novelId}
              chapterId={chapterId}
              currentUserId={user?.id ?? null}
              isNovelAuthor={isNovelAuthor}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
