import type { AuthorNovelStats } from "@/lib/data/authorStats";

// Shown only to the novel's author. Displays the last 7 days of reader
// activity + this novel's current trending rank. Because trending
// excludes the author's own actions, the wording makes it clear that
// the author's own reactions/comments/library adds don't move the
// number — otherwise it looks like a bug when their own tap doesn't
// nudge the counts.
export function AuthorStatsPanel({ stats }: { stats: AuthorNovelStats }) {
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

      <p className="mt-4 text-sm">
        <span className="font-medium">Trending rank:</span>{" "}
        {stats.trending_rank !== null ? (
          <>#{stats.trending_rank}</>
        ) : (
          <span className="text-[var(--muted)]">not on the trending list yet</span>
        )}
      </p>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Numbers cover the last 7 days. Trending is about how fast a novel is growing, not its
        lifetime totals. Your own reactions, comments, library adds and reads of your own novel
        don&apos;t count toward trending — so if you leave a reaction on your own paragraph,
        expect these numbers not to move.
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
