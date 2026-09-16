import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentDeleteButton } from "@/components/CommentDeleteButton";
import { CommentBody } from "@/components/SpoilerComment";
import { CommentForm } from "@/components/CommentForm";
import { LoginPromptCard } from "@/components/LoginPromptCard";
import { PlainParagraphList } from "@/components/ParagraphView";
import {
  addParagraphComment,
  deleteParagraphComment,
  revealParagraphComment,
} from "@/lib/actions/comments";
import { getParagraphComments } from "@/lib/data/comments";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getChapter, getNovelById } from "@/lib/data/novels";
import { assignPids, parseMarkdownParagraphs, type Paragraph } from "@/lib/chapterContent";

export default async function ParagraphDiscussionPage({
  params,
}: {
  params: Promise<{ novelId: string; chapterId: string; paragraphPid: string }>;
}) {
  const { novelId, chapterId, paragraphPid } = await params;

  const [novel, chapter, { user }] = await Promise.all([
    getNovelById(novelId),
    getChapter(novelId, chapterId),
    getCurrentUserAndProfile(),
  ]);
  if (!novel || !chapter) notFound();

  const storedParagraphs = Array.isArray(chapter.paragraphs)
    ? (chapter.paragraphs as Paragraph[])
    : [];
  const paragraphs: Paragraph[] = storedParagraphs.length > 0
    ? storedParagraphs
    : assignPids(parseMarkdownParagraphs(chapter.body ?? ""), []);

  const paragraph = paragraphs.find((p) => p.pid === paragraphPid);
  if (!paragraph) notFound();

  const isNovelAuthor = user?.id === novel.author_id;
  const comments = await getParagraphComments(chapterId, paragraphPid);
  const submit = addParagraphComment.bind(null, novelId, chapterId, paragraphPid);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <p className="mb-1 text-sm text-[var(--muted)]">
        <Link href={`/novels/${novelId}/chapters/${chapterId}`} className="hover:text-[var(--brand)]">
          &larr; Back to {chapter.title}
        </Link>
      </p>
      <h1 className="mb-4 text-xl font-semibold">Paragraph discussion</h1>

      <blockquote className="mb-6 rounded-xl border-l-4 border-[var(--brand)] bg-[var(--surface)] p-4 text-sm">
        <p className="mb-2 text-xs italic text-[var(--muted)]">The paragraph being discussed</p>
        <PlainParagraphList paragraphs={[paragraph]} />
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
            const deleteAction = deleteParagraphComment.bind(null, novelId, chapterId, paragraphPid, c.id);
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
