import { createClient } from "@/lib/supabase/server";

export interface AuthorNovelStats {
  reads_7d: number;
  library_7d: number;
  reactions_7d: number;
  comments_7d: number;
  trending_rank: number | null;
}

// Returns 7-day activity for one of the caller's own novels + its
// current trending rank. Only the novel's author gets a row back --
// the underlying SECURITY DEFINER function refuses anyone else.
// Returns null on any error or if the caller isn't the author.
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
  };
}
