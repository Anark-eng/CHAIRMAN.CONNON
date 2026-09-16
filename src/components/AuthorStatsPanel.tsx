import type { AuthorNovelStats } from "@/lib/data/authorStats";
import { BOARD_SHORT_LABEL, RATING_MIN_COUNT, formatRatingAverage } from "@/lib/rankings";

// Shown only to the novel's author. Displays the last 7 days of reader
// activity + this novel's rating + this novel's position on each of
// the three boards. Because trending excludes the author's own
// actions, and because rating requires a signed-in reader that isn't
// the author, the copy makes both facts explicit so the missing
// "rate your own novel" control and the flat-looking trending numbers
// don't read as bugs.
export function AuthorStatsPanel({ stats }: { stats: AuthorNovelStats }) {
  const boards: Array<[string, number | null]> = [
    [BOARD_SHORT_LABEL.trending, stats.trending_rank],
    [BOARD_SHORT_LABEL.top_rated, stats.top_rated_rank],
    [BOARD_SHORT_LABEL.most_read, stats.most_read_rank],
  ];

  return (
    <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your novel this week</h2>
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Only you can see this</span>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Reads" value={stats.reads_7d} />
        <Stat label="Library adds" value={stats.library_7d} />
        <Stat label="Reactions" value={stats.reactions_7d} />
        <Stat label="Comments" value={stats.comments_7d} />
      </dl>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Rating</p>
          {stats.rating_count >= RATING_MIN_COUNT ? (
            <p className="mt-1">
              <span className="text-2xl font-semibold tabular-nums">
                {formatRatingAverage(stats.avg_score)}
              </span>
              <span className="ml-1 text-sm text-[var(--muted)]">
                / 10 &middot; {stats.rating_count} ratings
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {stats.rating_count === 0
                ? `No ratings yet — needs ${RATING_MIN_COUNT} to show an average.`
                : `${stats.rating_count} of ${RATING_MIN_COUNT} ratings needed for an average.`}
            </p>
          )}
          {stats.rating_count > 0 && <ScoreHistogram counts={stats.score_histogram} />}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Board positions</p>
          <ul className="mt-1 space-y-1 text-sm">
            {boards.map(([label, rank]) => (
              <li key={label}>
                <span className="capitalize font-medium">{label}:</span>{" "}
                {rank !== null ? (
                  <span>#{rank}</span>
                ) : (
                  <span className="text-[var(--muted)]">not currently on this board</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Numbers cover the last 7 days. Trending is about how fast a novel is growing, not lifetime
        totals; your own reactions, comments, library adds and reads of your own novel don&apos;t
        move it. You also can&apos;t rate your own novel, so that control doesn&apos;t appear on
        this page — that&apos;s deliberate, not a bug.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

// Simple 10-column histogram. counts[i] holds the number of ratings
// with score rounded up to i+1 (so bucket 0 is 0.5–1.0, bucket 9 is
// 9.5–10.0). Rendered as bars whose height is proportional to the
// largest bucket, capped at 40px so the panel doesn't grow unbounded.
function ScoreHistogram({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="mt-3">
      <div className="flex items-end gap-1" aria-label="Score distribution">
        {counts.map((n, i) => {
          const height = Math.max(2, Math.round((n / max) * 40));
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-[var(--muted)]">{n || ""}</span>
              <div
                className="w-full rounded-sm bg-[var(--brand)]"
                style={{ height: `${height}px`, opacity: n === 0 ? 0.15 : 1 }}
                aria-hidden
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
        <span>1</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
}
