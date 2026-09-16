import { createClient } from "@/lib/supabase/server";
import type { NovelCardData } from "./types";
import type { BoardKey } from "@/lib/rankings";
import { CARD_SELECT, toCard, type NovelRow } from "./novels";
import { getRatingSummariesFor, type NovelRatingSummary } from "./ratings";

export interface BoardEntry {
  novel: NovelCardData;
  rank: number;
  rating?: NovelRatingSummary;
  metric: {
    // A short board-specific value shown alongside the rank
    // (e.g. "8.7 / 10" for top rated, "1,240 readers" for most read).
    // Trending doesn't render this; its own score isn't a number readers care about.
    label: string;
  } | null;
}

// The total number of novels that would qualify for a board if the
// blocklist weren't applied. Used to decide whether the board is
// "live" (>= BOARD_MIN_QUALIFIERS) — that gate is about site-wide
// activity, not about how much a given reader's blocklist trims.
export async function getBoardQualifierCount(board: BoardKey): Promise<number> {
  const supabase = await createClient();
  const table = TABLE_FOR_BOARD[board];
  const { count } = await supabase.from(table).select("novel_id", { count: "exact", head: true });
  return count ?? 0;
}

const TABLE_FOR_BOARD: Record<BoardKey, "trending_scores" | "top_rated_scores" | "most_read_scores"> = {
  trending: "trending_scores",
  top_rated: "top_rated_scores",
  most_read: "most_read_scores",
};

// Load one board. Ranks come out of the stored scores table, so the
// numbers are consistent site-wide within a refresh cycle. Blocklist
// is applied to the returned list; ranks are the *unfiltered* ranks
// so #4 stays #4 even if someone blocks #1.
export async function getBoardEntries(
  board: BoardKey,
  limit: number,
  excludedNovelIds: Set<string> | undefined,
): Promise<BoardEntry[]> {
  const supabase = await createClient();

  // Over-fetch so blocklist trimming doesn't leave the list short.
  const fetchLimit = limit + (excludedNovelIds?.size ?? 0);
  let scoreRows: Array<{ novel_id: string; extra?: unknown; rank: number }> = [];

  if (board === "trending") {
    const { data } = await supabase
      .from("trending_scores")
      .select("novel_id, score, computed_at")
      .order("score", { ascending: false })
      .order("computed_at", { ascending: false })
      .limit(fetchLimit);
    scoreRows = (data ?? []).map((r, i) => ({ novel_id: r.novel_id, extra: null, rank: i + 1 }));
  } else if (board === "top_rated") {
    const { data } = await supabase
      .from("top_rated_scores")
      .select("novel_id, rank_score, avg_score, rating_count, computed_at")
      .order("rank_score", { ascending: false })
      .order("computed_at", { ascending: false })
      .limit(fetchLimit);
    scoreRows = (data ?? []).map((r, i) => ({
      novel_id: r.novel_id,
      extra: { avg: Number(r.avg_score), count: r.rating_count },
      rank: i + 1,
    }));
  } else {
    const { data } = await supabase
      .from("most_read_scores")
      .select("novel_id, distinct_readers, computed_at")
      .order("distinct_readers", { ascending: false })
      .order("computed_at", { ascending: false })
      .limit(fetchLimit);
    scoreRows = (data ?? []).map((r, i) => ({
      novel_id: r.novel_id,
      extra: { distinctReaders: r.distinct_readers },
      rank: i + 1,
    }));
  }

  const visible = scoreRows.filter((r) => !excludedNovelIds?.has(r.novel_id)).slice(0, limit);
  if (visible.length === 0) return [];

  const ids = visible.map((r) => r.novel_id);
  const [{ data: novels }, ratingByNovel] = await Promise.all([
    supabase.from("novels").select(CARD_SELECT).in("id", ids),
    getRatingSummariesFor(ids),
  ]);

  const byId = new Map(((novels ?? []) as unknown as NovelRow[]).map((n) => [n.id, n]));

  const results: BoardEntry[] = [];
  for (const r of visible) {
    const n = byId.get(r.novel_id);
    if (!n) continue;
    const rating = ratingByNovel.get(r.novel_id);
    const entry: BoardEntry = {
      novel: toCard(n),
      rank: r.rank,
      metric: metricFor(board, r.extra),
    };
    if (rating) entry.rating = rating;
    results.push(entry);
  }
  return results;
}

function metricFor(board: BoardKey, extra: unknown): BoardEntry["metric"] {
  if (board === "trending") return null;
  if (board === "top_rated") {
    const e = extra as { avg: number; count: number };
    return { label: `${e.avg.toFixed(1)} / 10 · ${e.count} ratings` };
  }
  const e = extra as { distinctReaders: number };
  return { label: `${e.distinctReaders.toLocaleString()} readers` };
}

// A novel's own position on each board, or null when it isn't on that
// board (either doesn't qualify or was pushed out). This runs three
// tiny queries; still cheap because each is a keyed lookup + a window.
// The gating on BOARD_MIN_QUALIFIERS happens in the caller.
export async function getBoardPositionsForNovel(novelId: string): Promise<{
  trending: number | null;
  top_rated: number | null;
  most_read: number | null;
}> {
  const supabase = await createClient();
  const [{ data: t }, { data: tr }, { data: mr }] = await Promise.all([
    supabase.from("trending_scores").select("novel_id, score").order("score", { ascending: false }),
    supabase.from("top_rated_scores").select("novel_id, rank_score").order("rank_score", { ascending: false }),
    supabase.from("most_read_scores").select("novel_id, distinct_readers").order("distinct_readers", { ascending: false }),
  ]);
  const rankIn = (rows: { novel_id: string }[] | null | undefined): number | null => {
    if (!rows) return null;
    const idx = rows.findIndex((r) => r.novel_id === novelId);
    return idx < 0 ? null : idx + 1;
  };
  return {
    trending: rankIn(t),
    top_rated: rankIn(tr),
    most_read: rankIn(mr),
  };
}
