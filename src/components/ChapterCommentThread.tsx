"use client";

import { useState } from "react";
import { CommentBody } from "@/components/SpoilerComment";
import { CommentDeleteButton } from "@/components/CommentDeleteButton";
import { CommentForm } from "@/components/CommentForm";
import {
  addChapterComment,
  deleteChapterComment,
  revealChapterComment,
} from "@/lib/actions/comments";
import type { ThreadedChapterComment } from "@/lib/data/comments";

interface Props {
  thread: ThreadedChapterComment;
  novelId: string;
  chapterId: string;
  currentUserId: string | null;
  isNovelAuthor: boolean;
}

export function ChapterCommentThread({ thread, novelId, chapterId, currentUserId, isNovelAuthor }: Props) {
  const [replyOpen, setReplyOpen] = useState(false);
  const canReply = currentUserId !== null;

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <CommentHeader
        authorName={thread.author_pen_name}
        createdAt={thread.created_at}
        canDelete={Boolean(currentUserId) && (currentUserId === thread.author_id || isNovelAuthor)}
        deleteAction={deleteChapterComment.bind(null, novelId, chapterId, thread.id)}
      />
      <CommentBody comment={thread} onReveal={revealChapterComment} />

      <div className="mt-3 flex items-center gap-3 text-xs text-[var(--muted)]">
        {canReply && (
          <button
            type="button"
            onClick={() => setReplyOpen((v) => !v)}
            className="font-medium hover:text-[var(--foreground)]"
          >
            {replyOpen ? "Cancel reply" : "Reply"}
          </button>
        )}
        {thread.replies.length > 0 && (
          <span>
            {thread.replies.length} repl{thread.replies.length === 1 ? "y" : "ies"}
          </span>
        )}
      </div>

      {replyOpen && (
        <div className="mt-3 pl-4 border-l-2 border-[var(--border)]">
          <CommentForm
            action={addChapterComment.bind(null, novelId, chapterId)}
            submitLabel="Post reply"
            placeholder="Write your reply…"
            hiddenFields={{ parent_id: thread.id }}
            small
            onSubmitted={() => setReplyOpen(false)}
          />
        </div>
      )}

      {thread.replies.length > 0 && (
        <ul className="mt-4 space-y-3 pl-4 border-l-2 border-[var(--border)]">
          {thread.replies.map((reply) => (
            <li key={reply.id} className="rounded-lg bg-[var(--background)] p-3">
              <CommentHeader
                authorName={reply.author_pen_name}
                createdAt={reply.created_at}
                canDelete={
                  Boolean(currentUserId) && (currentUserId === reply.author_id || isNovelAuthor)
                }
                deleteAction={deleteChapterComment.bind(null, novelId, chapterId, reply.id)}
              />
              <CommentBody comment={reply} onReveal={revealChapterComment} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function CommentHeader({
  authorName,
  createdAt,
  canDelete,
  deleteAction,
}: {
  authorName: string | null;
  createdAt: string;
  canDelete: boolean;
  deleteAction: () => Promise<void>;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
      <span>
        <span className="font-medium text-[var(--foreground)]">{authorName ?? "Anonymous reader"}</span>
        <span className="ml-2">{new Date(createdAt).toLocaleString()}</span>
      </span>
      {canDelete && <CommentDeleteButton action={deleteAction} />}
    </div>
  );
}
