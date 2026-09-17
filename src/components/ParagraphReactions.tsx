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
import type { Paragraph } from "@/lib/chapterContent";
import { ParagraphRuns } from "./ParagraphView";

interface ParagraphReactionsProps {
  novelId: string;
  chapterId: string;
  paragraph: Paragraph;
  initialCounts: ReactionCountsShape;
  initialMyReactions: ReactionType[];
  initialCommentCount: number;
  isLoggedIn: boolean;
  interactive: boolean; // false in preview mode: no bar, no counts, no comment link
}

// One reactive paragraph. Keys on the paragraph's stable pid so
// reactions and comments follow the paragraph across editor rewrites.
export function ParagraphReactions({
  novelId,
  chapterId,
  paragraph,
  initialCounts,
  initialMyReactions,
  initialCommentCount,
  isLoggedIn,
  interactive,
}: ParagraphReactionsProps) {
  const [counts, setCounts] = useState<ReactionCountsShape>(initialCounts ?? EMPTY_COUNTS);
  const [myReactions, setMyReactions] = useState<Set<ReactionType>>(new Set(initialMyReactions));
  const [barOpen, setBarOpen] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [pendingType, setPendingType] = useState<ReactionType | null>(null);
  const [, startTransition] = useTransition();

  const topReactions = useMemo(() => {
    const entries: Array<[ReactionType, number]> = [
      ["shocked", counts.shocked],
      ["heartbreak", counts.heartbreak],
      ["laughed", counts.laughed],
      ["goosebumps", counts.goosebumps],
      ["best_line", counts.best_line],
      ["confused", counts.confused],
    ];
    return entries.filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [counts]);

  const showAccentBar = interactive && counts.total >= ACCENT_BAR_THRESHOLD;
  const paragraphPid = paragraph.pid;

  const handleToggle = useCallback(
    (type: ReactionType) => {
      if (!isLoggedIn) {
        setNeedsLogin(true);
        return;
      }
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
        const result = await toggleParagraphReaction(novelId, chapterId, paragraphPid, type);
        setPendingType(null);
        if (!result.ok) {
          setCounts(counts);
          setMyReactions(myReactions);
          if (result.needsLogin) setNeedsLogin(true);
          return;
        }
        if (result.counts) setCounts({ ...result.counts });
      });
    },
    [chapterId, counts, isLoggedIn, myReactions, novelId, paragraphPid],
  );

  return (
    <div
      className={
        "relative pl-3 " + (showAccentBar ? "border-l-2 border-[var(--brand)]" : "border-l-2 border-transparent")
      }
    >
      <button
        type="button"
        onClick={() => interactive && setBarOpen((v) => !v)}
        aria-expanded={barOpen}
        aria-label="Tap to react or comment on this paragraph."
        className="block w-full cursor-pointer select-text text-left"
        style={{ WebkitTouchCallout: "none" }}
        disabled={!interactive}
      >
        <ParagraphBlock paragraph={paragraph} />
      </button>

      {interactive && (barOpen || counts.total > 0 || initialCommentCount > 0) && (
        // Only reserve the slot when something will actually appear
        // there: the bar is open, or the paragraph already has
        // reactions or comments. Empty paragraphs render as prose,
        // with no dead space between them. When counts DO exist the
        // slot is sized to fit them so nothing shifts on load; when
        // the bar opens on an empty paragraph it grows the slot but
        // the tapped paragraph stays where it is on screen (the bar
        // renders below it, pushing later text down, never the
        // paragraph itself up).
        <div className={barOpen ? "mt-1.5 mb-4 min-h-[44px]" : "mt-1 mb-3 text-xs"}>
          {barOpen ? (
            <ReactionBar
              myReactions={myReactions}
              pendingType={pendingType}
              onToggle={handleToggle}
              novelId={novelId}
              chapterId={chapterId}
              paragraphPid={paragraphPid}
              commentCount={initialCommentCount}
            />
          ) : (
            <ParagraphCountsRow topReactions={topReactions} total={counts.total} commentCount={initialCommentCount} />
          )}
        </div>
      )}

      {needsLogin && (
        <div role="dialog" aria-modal="true" className="mb-5 rounded-lg border border-current/30 p-3 text-sm">
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

function ParagraphBlock({ paragraph }: { paragraph: Paragraph }) {
  if (paragraph.kind === "break") {
    return (
      <div className="my-2 text-center text-xl opacity-50" aria-hidden>
        &sect; &sect; &sect;
      </div>
    );
  }
  if (paragraph.kind === "h") {
    return (
      <h3 data-paragraph-pid={paragraph.pid} className="mb-1 text-lg font-semibold">
        <ParagraphRuns runs={paragraph.runs} />
      </h3>
    );
  }
  if (paragraph.kind === "quote") {
    return (
      <blockquote
        data-paragraph-pid={paragraph.pid}
        className="mb-1 border-l-2 border-current/40 pl-4 italic"
      >
        <ParagraphRuns runs={paragraph.runs} />
      </blockquote>
    );
  }
  return (
    <p data-paragraph-pid={paragraph.pid} className="mb-1">
      <ParagraphRuns runs={paragraph.runs} />
    </p>
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
  if (topReactions.length === 0 && commentCount === 0) return <span aria-hidden />;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
      {topReactions.map(([type, count]) => (
        <span key={type} className="inline-flex items-center gap-1 rounded-full bg-current/5 px-2 py-0.5">
          <span aria-hidden>{REACTION_EMOJI[type]}</span>
          <span>{count}</span>
        </span>
      ))}
      {topReactions.length > 0 && total > 0 && <span className="opacity-60">{total} total</span>}
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
  paragraphPid,
  commentCount,
}: {
  myReactions: Set<ReactionType>;
  pendingType: ReactionType | null;
  onToggle: (type: ReactionType) => void;
  novelId: string;
  chapterId: string;
  paragraphPid: string;
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
        href={`/novels/${novelId}/chapters/${chapterId}/paragraphs/${paragraphPid}`}
        onClick={(e) => e.stopPropagation()}
        className="ml-1 inline-flex items-center gap-1 rounded-full border border-current/30 px-3 py-1 text-xs"
      >
        Discuss
        {commentCount > 0 && <span className="opacity-70">({commentCount})</span>}
      </Link>
    </div>
  );
}
