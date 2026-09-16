import Link from "next/link";
import { BOARD_SHORT_LABEL, type BoardKey } from "@/lib/rankings";

// Small row of "#4 trending" / "#12 top rated" / "#7 most read"
// badges. Each labelled by board so a reader can never confuse a
// trending position for a top-rated one. Silent when the novel isn't
// currently ranked on any live board.
export function BoardPositionRow({
  positions,
}: {
  positions: Array<{ board: BoardKey; rank: number }>;
}) {
  if (positions.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {positions.map(({ board, rank }) => (
        <Link
          key={board}
          href="/rankings"
          className="rounded-full border border-[var(--brand)] px-2.5 py-0.5 text-xs font-medium text-[var(--brand)]"
        >
          #{rank} {BOARD_SHORT_LABEL[board]}
        </Link>
      ))}
    </div>
  );
}
