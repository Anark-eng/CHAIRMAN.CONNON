"use client";

import { useState, useTransition } from "react";
import type { CommentView } from "@/lib/data/comments";

// Renders a comment's body. For spoilers, the initial render carries NO
// body text at all (the server withholds it). Tapping "Reveal" calls a
// server action that fetches this one comment's body.
export function CommentBody({
  comment,
  onReveal,
}: {
  comment: CommentView;
  onReveal: (commentId: string) => Promise<{ body: string | null }>;
}) {
  const [revealed, setRevealed] = useState<string | null>(comment.is_spoiler ? null : comment.body);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!comment.is_spoiler) {
    return <p className="whitespace-pre-line">{comment.body ?? ""}</p>;
  }

  if (revealed !== null) {
    return (
      <p className="whitespace-pre-line">
        <span className="mr-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Spoiler
        </span>
        {revealed}
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await onReveal(comment.id);
            if (result.body === null) {
              setError("Couldn't load this comment. It may have been deleted.");
              return;
            }
            setRevealed(result.body);
          });
        }}
        disabled={isPending}
        className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-400"
      >
        {isPending ? "Revealing…" : "Spoiler — tap to reveal"}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
