"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { REACTION_TYPES, type ReactionType } from "@/lib/supabase/database.types";
import {
  ACCENT_BAR_THRESHOLD,
  EMPTY_COUNTS,
  REACTION_EMOJI,
  REACTION_LABELS,
  type ReactionCountsShape,
} from "@/lib/reactions";
import { toggleParagraphReaction } from "@/lib/actions/reactions";

interface ParagraphReactionsProps {
  novelId: string;
  chapterId: string;
  paragraphIndex: number;
  paragraphText: string;
  initialCounts: ReactionCountsShape;
  initialMyReactions: ReactionType[];
  initialCommentCount: number;
  isLoggedIn: boolean;
}

// One reactive paragraph. Tapping the paragraph body opens a small
// reaction bar; tapping the paragraph again closes it. Tapping a reaction
// toggles it (server action → refreshed counts). A comment button links
// through to the paragraph's discussion page.
//
// Everything under the paragraph text sits in a fixed-height slot so the
// paragraph itself never shifts when a count appears or the bar opens.
export function ParagraphReactions({
  novelId,
  chapterId,
  paragraphIndex,
  paragraphText,
  initialCounts,
  initialMyReactions,
  initialCommentCount,
  isLoggedIn,
}: ParagraphReactionsProps) {
  const [counts, setCounts] = useState<ReactionCountsShape>(initialCounts ?? EMPTY_COUNTS);
  const [myReactions, setMyReactions] = useState<Set<ReactionType>>(new Set(initialMyReactions));
  const [barOpen, setBarOpen] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [pendingType, setPendingType] = useState<ReactionType | null>(null);
  const [, startTransition] = useTransition();

  const topReactions = useMemo(() => {
    // Show up to three most-used reactions inline under the paragraph.
    const entries: Array<[ReactionType, number]> = [
      ["shocked", counts.shocked],
      ["heartbreak", counts.heartbreak],
      ["laughed", counts.laughed],
      ["goosebumps", counts.goosebumps],
      ["best_line", counts.best_line],
      ["confused", counts.confused],
    ];
    return entries
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [counts]);

  const showAccentBar = counts.total >= ACCENT_BAR_THRESHOLD;

  const handleToggle = useCallback(
    (type: ReactionType) => {
      if (!isLoggedIn) {
        setNeedsLogin(true);
        return;
      }
      // Optimistic update so a phone tap feels instant. The server
      // action returns the fresh counts and we reconcile on top.
      const currentlyActive = myReactions.has(type);
      const optimisticCounts = { ...counts };
      const delta = currentlyActive ? -1 : 1;
      optimisticCounts[type] = Math.max(0, optimisticCounts[type] + delta);
      optimisticCounts.total = Math.max(0, optimisticCounts.total + delta);
      const nextMine = new Set(myReactions);
      if (currentlyActive) nextMine.delete(type);
      else nextMine.add(type);

      setCounts(optimisticCounts);
      setMyReactions(nextMine);
      setPendingType(type);

      startTransition(async () => {
        const result = await toggleParagraphReaction(novelId, chapterId, paragraphIndex, type);
        setPendingType(null);
        if (!result.ok) {
          // Roll back the optimistic change.
          setCounts(counts);
          setMyReactions(myReactions);
          if (result.needsLogin) setNeedsLogin(true);
          return;
        }
        if (result.counts) {
          setCounts({ ...result.counts });
        }
      });
    },
    [chapterId, counts, isLoggedIn, myReactions, novelId, paragraphIndex],
  );

  return (
    <div
      className={
        "relative pl-3 " + (showAccentBar ? "border-l-2 border-[var(--brand)]" : "border-l-2 border-transparent")
      }
    >
      <button
        type="button"
        onClick={() => setBarOpen((v) => !v)}
        aria-expanded={barOpen}
        aria-label={`Paragraph ${paragraphIndex + 1}. Tap to react or comment.`}
        className="block w-full cursor-pointer select-text text-left"
        // Prevent iOS long-press callout; still supports text selection.
        style={{ WebkitTouchCallout: "none" }}
      >
        <p data-paragraph-index={paragraphIndex} className="mb-1">
          {paragraphText}
        </p>
      </button>

      {/* Fixed-height slot for counts + reaction bar, so text doesn't jump. */}
      <div className="mb-5 min-h-[44px]">
        {barOpen ? (
          <ReactionBar
            myReactions={myReactions}
            pendingType={pendingType}
            onToggle={handleToggle}
            novelId={novelId}
            chapterId={chapterId}
            paragraphIndex={paragraphIndex}
            paragraphText={paragraphText}
            commentCount={initialCommentCount}
          />
        ) : (
          <ParagraphCountsRow topReactions={topReactions} total={counts.total} commentCount={initialCommentCount} />
        )}
      </div>

      {needsLogin && (
        <div
          role="dialog"
          aria-modal="true"
          className="mb-5 rounded-lg border border-current/30 p-3 text-sm"
        >
          <p className="mb-2">Log in to react to paragraphs.</p>
          <div className="flex gap-3">
            <Link href="/login" className="rounded-full border border-current px-3 py-1">
              Log in
            </Link>
            <button
              type="button"
              onClick={() => setNeedsLogin(false)}
              className="rounded-full border border-current/40 px-3 py-1"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ParagraphCountsRow({
  topReactions,
  total,
  commentCount,
}: {
  topReactions: Array<[ReactionType, number]>;
  total: number;
  commentCount: number;
}) {
  if (topReactions.length === 0 && commentCount === 0) {
    // Empty slot — height already reserved by the parent's min-h.
    return <span aria-hidden />;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
      {topReactions.map(([type, count]) => (
        <span key={type} className="inline-flex items-center gap-1 rounded-full bg-current/5 px-2 py-0.5">
          <span aria-hidden>{REACTION_EMOJI[type]}</span>
          <span>{count}</span>
        </span>
      ))}
      {topReactions.length > 0 && total > 0 && (
        <span className="opacity-60">{total} total</span>
      )}
      {commentCount > 0 && (
        <span className="opacity-60">
          &middot; {commentCount} comment{commentCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function ReactionBar({
  myReactions,
  pendingType,
  onToggle,
  novelId,
  chapterId,
  paragraphIndex,
  paragraphText,
  commentCount,
}: {
  myReactions: Set<ReactionType>;
  pendingType: ReactionType | null;
  onToggle: (type: ReactionType) => void;
  novelId: string;
  chapterId: string;
  paragraphIndex: number;
  paragraphText: string;
  commentCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-current/20 bg-current/5 px-2 py-1.5">
      {REACTION_TYPES.map((type) => {
        const active = myReactions.has(type);
        const isPending = pendingType === type;
        return (
          <button
            key={type}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(type);
            }}
            disabled={isPending}
            aria-pressed={active}
            aria-label={REACTION_LABELS[type]}
            title={REACTION_LABELS[type]}
            className={
              "inline-flex h-8 w-8 items-center justify-center rounded-full text-base transition-colors " +
              (active ? "bg-[var(--brand)] text-[var(--brand-foreground)]" : "hover:bg-current/10") +
              (isPending ? " opacity-60" : "")
            }
          >
            <span aria-hidden>{REACTION_EMOJI[type]}</span>
          </button>
        );
      })}
      <Link
        href={{
          pathname: `/novels/${novelId}/chapters/${chapterId}/paragraphs/${paragraphIndex}`,
          query: { text: paragraphText.slice(0, 240) },
        }}
        onClick={(e) => e.stopPropagation()}
        className="ml-1 inline-flex items-center gap-1 rounded-full border border-current/30 px-3 py-1 text-xs"
      >
        Discuss
        {commentCount > 0 && <span className="opacity-70">({commentCount})</span>}
      </Link>
    </div>
  );
}
