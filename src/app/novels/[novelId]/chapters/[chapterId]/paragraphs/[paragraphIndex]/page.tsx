import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentDeleteButton } from "@/components/CommentDeleteButton";
import { CommentBody } from "@/components/SpoilerComment";
import { CommentForm } from "@/components/CommentForm";
import { LoginPromptCard } from "@/components/LoginPromptCard";
import {
  addParagraphComment,
  deleteParagraphComment,
  revealParagraphComment,
} from "@/lib/actions/comments";
import { getParagraphComments } from "@/lib/data/comments";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getChapter, getNovelById } from "@/lib/data/novels";
import { splitParagraphs } from "@/lib/reading";

export default async function ParagraphDiscussionPage({
  params,
}: {
  params: Promise<{ novelId: string; chapterId: string; paragraphIndex: string }>;
}) {
  const { novelId, chapterId, paragraphIndex } = await params;
  const idx = Number.parseInt(paragraphIndex, 10);
  if (!Number.isFinite(idx) || idx < 0) notFound();

  const [novel, chapter, { user }] = await Promise.all([
    getNovelById(novelId),
    getChapter(novelId, chapterId),
    getCurrentUserAndProfile(),
  ]);
  if (!novel || !chapter) notFound();

  const paragraphs = splitParagraphs(chapter.body);
  const paragraph = paragraphs[idx];
  if (!paragraph) notFound();

  const isNovelAuthor = user?.id === novel.author_id;
  const comments = await getParagraphComments(chapterId, idx);

  const submit = addParagraphComment.bind(null, novelId, chapterId, idx);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <p className="mb-1 text-sm text-[var(--muted)]">
        <Link href={`/novels/${novelId}/chapters/${chapterId}`} className="hover:text-[var(--brand)]">
          &larr; Back to {chapter.title}
        </Link>
      </p>
      <h1 className="mb-4 text-xl font-semibold">Paragraph discussion</h1>

      <blockquote className="mb-6 rounded-xl border-l-4 border-[var(--brand)] bg-[var(--surface)] p-4 text-sm">
        <p className="italic text-[var(--muted)]">Paragraph {idx + 1}</p>
        <p className="mt-1 whitespace-pre-line">{paragraph.text}</p>
      </blockquote>

      {user ? (
        <div className="mb-8">
          <CommentForm action={submit} placeholder="Share your thoughts on this paragraph…" />
        </div>
      ) : (
        <LoginPromptCard message="Log in to comment on paragraphs." />
      )}

      <h2 className="mb-3 text-lg font-semibold">
        {comments.length === 0 ? "No comments yet" : `${comments.length} comment${comments.length === 1 ? "" : "s"}`}
      </h2>

      {comments.length > 0 && (
        <ul className="space-y-4">
          {comments.map((c) => {
            const canDelete = user && (user.id === c.author_id || isNovelAuthor);
            const deleteAction = deleteParagraphComment.bind(null, novelId, chapterId, idx, c.id);
            return (
              <li key={c.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                  <span>
                    <span className="font-medium text-[var(--foreground)]">
                      {c.author_pen_name ?? "Anonymous reader"}
                    </span>
                    <span className="ml-2">{new Date(c.created_at).toLocaleString()}</span>
                  </span>
                  {canDelete && <CommentDeleteButton action={deleteAction} />}
                </div>
                <CommentBody comment={c} onReveal={revealParagraphComment} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
