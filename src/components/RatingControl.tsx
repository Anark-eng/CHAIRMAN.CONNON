"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { rateNovel, removeMyRating } from "@/lib/actions/ratings";
import { RATING_MIN_COUNT, formatRatingAverage, normaliseRating } from "@/lib/rankings";

// Rating control for a single novel. Not shown inside the chapter
// reader — kept to the novel page.
//
// The control is a select of 20 half-step values (0.5 … 10). Choosing
// a value calls the server action optimistically: the average + count
// under the control update immediately, then reconcile with what the
// server actually returned. If the save fails, we roll back.
export function RatingControl({
  novelId,
  isLoggedIn,
  isOwnNovel,
  initialMyRating,
  initialSummary,
}: {
  novelId: string;
  isLoggedIn: boolean;
  isOwnNovel: boolean;
  initialMyRating: number | null;
  initialSummary: { ratingCount: number; avgScore: number };
}) {
  const [myRating, setMyRating] = useState<number | null>(initialMyRating);
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (isOwnNovel) {
    return (
      <p className="text-xs text-[var(--muted)]">
        You can&apos;t rate your own novel — that&apos;s why the control isn&apos;t shown here.
      </p>
    );
  }

  // Guest readers get the running summary and a plain Log-in link.
  // We never render the "Your rating" dropdown to someone who can't
  // change it — a dropdown that just prompts a login is a dead
  // control per the no-dead-controls rule.
  if (!isLoggedIn) {
    return <GuestRatingSummary summary={summary} />;
  }

  function optimisticApply(nextRating: number | null) {
    const oldRating = myRating;
    const oldSummary = summary;

    let nextCount = summary.ratingCount;
    let nextSum = summary.avgScore * summary.ratingCount;
    if (oldRating === null && nextRating !== null) {
      nextCount += 1;
      nextSum += nextRating;
    } else if (oldRating !== null && nextRating === null) {
      nextCount -= 1;
      nextSum -= oldRating;
    } else if (oldRating !== null && nextRating !== null) {
      nextSum += nextRating - oldRating;
    }
    const nextAvg = nextCount > 0 ? nextSum / nextCount : 0;

    setMyRating(nextRating);
    setSummary({ ratingCount: Math.max(0, nextCount), avgScore: Math.max(0, nextAvg) });
    return { oldRating, oldSummary };
  }

  function handleChange(raw: string) {
    setError(null);

    if (raw === "") {
      const { oldRating, oldSummary } = optimisticApply(null);
      startTransition(async () => {
        const result = await removeMyRating(novelId);
        if (!result.ok) {
          setMyRating(oldRating);
          setSummary(oldSummary);
          if (result.error) setError(result.error);
          return;
        }
        if (result.summary) setSummary(result.summary);
      });
      return;
    }

    const parsed = normaliseRating(Number(raw));
    if (parsed === null) return;
    const { oldRating, oldSummary } = optimisticApply(parsed);
    startTransition(async () => {
      const result = await rateNovel(novelId, parsed);
      if (!result.ok) {
        setMyRating(oldRating);
        setSummary(oldSummary);
        if (result.error) setError(result.error);
        return;
      }
      if (result.summary) setSummary(result.summary);
      if (typeof result.myRating !== "undefined") setMyRating(result.myRating);
    });
  }

  const under = summary.ratingCount < RATING_MIN_COUNT;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Rating</span>
        {under ? (
          summary.ratingCount === 0 ? (
            <span className="text-xs text-[var(--muted)]">Needs {RATING_MIN_COUNT} ratings</span>
          ) : (
            <span className="text-xs text-[var(--muted)]">
              {summary.ratingCount}/{RATING_MIN_COUNT} ratings so far
            </span>
          )
        ) : (
          <span>
            <span className="text-lg font-semibold">{formatRatingAverage(summary.avgScore)}</span>
            <span className="ml-1 text-xs text-[var(--muted)]">
              / 10 &middot; {summary.ratingCount} ratings
            </span>
          </span>
        )}
      </div>

      <label className="block text-xs text-[var(--muted)]">
        Your rating
        <select
          value={myRating === null ? "" : String(myRating)}
          onChange={(e) => handleChange(e.target.value)}
          className="ml-2 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
        >
          <option value="">— none —</option>
          {HALF_STEP_OPTIONS.map((v) => (
            <option key={v} value={String(v)}>
              {v.toFixed(1)}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Read-only summary for logged-out readers. Uses the same "under 5
// ratings" wording as the signed-in control's header, then a plain
// "Log in to rate" link. No dropdown, so no dead control.
function GuestRatingSummary({ summary }: { summary: { ratingCount: number; avgScore: number } }) {
  const under = summary.ratingCount < RATING_MIN_COUNT;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Rating</span>
        {under ? (
          summary.ratingCount === 0 ? (
            <span className="text-xs text-[var(--muted)]">Needs {RATING_MIN_COUNT} ratings</span>
          ) : (
            <span className="text-xs text-[var(--muted)]">
              {summary.ratingCount}/{RATING_MIN_COUNT} ratings so far
            </span>
          )
        ) : (
          <span>
            <span className="text-lg font-semibold">{formatRatingAverage(summary.avgScore)}</span>
            <span className="ml-1 text-xs text-[var(--muted)]">
              / 10 &middot; {summary.ratingCount} ratings
            </span>
          </span>
        )}
      </div>
      <p className="mt-3 text-xs">
        <Link href="/login" className="text-[var(--brand)] hover:underline">
          Log in
        </Link>{" "}
        to rate this novel.
      </p>
    </div>
  );
}

const HALF_STEP_OPTIONS = Array.from({ length: 20 }, (_, i) => (i + 1) / 2);
