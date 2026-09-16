import { RATING_MIN_COUNT, formatRatingAverage } from "@/lib/rankings";

// Displays the running rating summary the way the spec wants it:
//   "8.7 out of 10 · 42 ratings"
// Under the minimum, no average — just the count so far and how many
// more are needed.
export function RatingSummary({
  ratingCount,
  avgScore,
  size = "md",
}: {
  ratingCount: number;
  avgScore: number;
  size?: "sm" | "md";
}) {
  const under = ratingCount < RATING_MIN_COUNT;
  const numberClass = size === "sm" ? "text-sm" : "text-lg font-semibold";
  const helperClass = size === "sm" ? "text-xs text-[var(--muted)]" : "text-sm text-[var(--muted)]";

  if (under) {
    if (ratingCount === 0) {
      return <p className={helperClass}>No ratings yet — needs {RATING_MIN_COUNT} to show an average.</p>;
    }
    const remaining = RATING_MIN_COUNT - ratingCount;
    return (
      <p className={helperClass}>
        {ratingCount} rating{ratingCount === 1 ? "" : "s"} — {remaining} more to show an average.
      </p>
    );
  }

  return (
    <p>
      <span className={numberClass}>{formatRatingAverage(avgScore)}</span>
      <span className={helperClass}>
        {" "}
        out of 10 &middot; {ratingCount} rating{ratingCount === 1 ? "" : "s"}
      </span>
    </p>
  );
}

// Compact single-line variant for novel cards. Silent when the novel
// hasn't cleared the minimum, so cards aren't polluted with pleas for
// ratings across a Browse grid.
export function RatingSummaryTag({
  ratingCount,
  avgScore,
}: {
  ratingCount: number;
  avgScore: number;
}) {
  if (ratingCount < RATING_MIN_COUNT) return null;
  return (
    <span className="text-xs text-[var(--muted)]">
      {formatRatingAverage(avgScore)} / 10 &middot; {ratingCount}
    </span>
  );
}
