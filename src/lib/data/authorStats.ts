import { createClient } from "@/lib/supabase/server";

export interface AuthorNovelStats {
  reads_7d: number;
  library_7d: number;
  reactions_7d: number;
  comments_7d: number;
  trending_rank: number | null;
  top_rated_rank: number | null;
  most_read_rank: number | null;
  rating_count: number;
  avg_score: number;
  score_histogram: number[]; // length-10, bucket i counts scores in (i, i+0.5]
}

// Returns 7-day activity + rating summary + board positions for one
// of the caller's own novels. Only the novel's author gets a row back
// — the underlying SECURITY DEFINER function refuses anyone else.
export async function getAuthorNovelStats(novelId: string): Promise<AuthorNovelStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_author_novel_stats", { p_novel_id: novelId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    reads_7d: row.reads_7d ?? 0,
    library_7d: row.library_7d ?? 0,
    reactions_7d: row.reactions_7d ?? 0,
    comments_7d: row.comments_7d ?? 0,
    trending_rank: row.trending_rank ?? null,
    top_rated_rank: row.top_rated_rank ?? null,
    most_read_rank: row.most_read_rank ?? null,
    rating_count: row.rating_count ?? 0,
    avg_score: Number(row.avg_score ?? 0),
    score_histogram: Array.isArray(row.score_histogram)
      ? row.score_histogram.map((n) => Number(n))
      : new Array(10).fill(0),
  };
}
