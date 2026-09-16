import Link from "next/link";
import { getBoardEntries, getBoardQualifierCount, type BoardEntry } from "@/lib/data/boards";
import { loadBlocklist } from "@/lib/data/blockedTags";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { BOARD_EXPLANATION, BOARD_LABEL, BOARD_MIN_QUALIFIERS, type BoardKey } from "@/lib/rankings";

const BOARDS: BoardKey[] = ["trending", "top_rated", "most_read"];

export default async function RankingsPage() {
  const { user } = await getCurrentUserAndProfile();
  const { excludedNovelIds } = await loadBlocklist(user?.id ?? null);

  const boards = await Promise.all(
    BOARDS.map(async (board) => {
      const qualifierCount = await getBoardQualifierCount(board);
      const live = qualifierCount >= BOARD_MIN_QUALIFIERS;
      const entries = live ? await getBoardEntries(board, 20, excludedNovelIds) : [];
      return { board, qualifierCount, live, entries };
    }),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Rankings</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Three boards, each measuring a different thing. A novel high on one board can be absent
          from another, and that&apos;s working correctly.
        </p>
      </header>

      {boards.map(({ board, qualifierCount, live, entries }) => (
        <BoardSection
          key={board}
          board={board}
          qualifierCount={qualifierCount}
          live={live}
          entries={entries}
        />
      ))}
    </div>
  );
}

function BoardSection({
  board,
  qualifierCount,
  live,
  entries,
}: {
  board: BoardKey;
  qualifierCount: number;
  live: boolean;
  entries: BoardEntry[];
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold">{BOARD_LABEL[board]}</h2>
      <p className="mt-1 mb-4 text-sm text-[var(--muted)]">{BOARD_EXPLANATION[board]}</p>

      {!live && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
          This board goes live once {BOARD_MIN_QUALIFIERS} novels qualify.
          {qualifierCount > 0 && ` So far ${qualifierCount} qualify.`}
        </p>
      )}

      {live && entries.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          Nothing to show — every qualifying novel is on your blocked-tag list.
        </p>
      )}

      {live && entries.length > 0 && (
        <ol className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {entries.map((entry) => (
            <li key={entry.novel.id} className="flex items-center gap-4 px-4 py-3">
              <span className="w-8 shrink-0 text-right text-lg font-semibold tabular-nums text-[var(--muted)]">
                {entry.rank}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/novels/${entry.novel.id}`} className="font-medium hover:text-[var(--brand)]">
                  {entry.novel.title}
                </Link>
                <p className="text-xs text-[var(--muted)]">
                  {entry.novel.authorPenName ?? "Unknown author"}
                </p>
              </div>
              {entry.metric && (
                <span className="shrink-0 text-xs text-[var(--muted)]">{entry.metric.label}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
