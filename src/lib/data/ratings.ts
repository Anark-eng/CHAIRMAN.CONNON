import { createClient } from "@/lib/supabase/server";

export interface NovelRatingSummary {
  novelId: string;
  ratingCount: number;
  avgScore: number; // 0 when there are no ratings; caller decides whether to show
}

// Reader-facing rating summary for one novel. Read from
// novel_rating_stats so no page has to recount.
export async function getRatingSummary(novelId: string): Promise<NovelRatingSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("novel_rating_stats")
    .select("rating_count, avg_score")
    .eq("novel_id", novelId)
    .maybeSingle();
  return {
    novelId,
    ratingCount: data?.rating_count ?? 0,
    avgScore: Number(data?.avg_score ?? 0),
  };
}

// A batch version for lists (e.g. cards on Browse). Returns null for
// novels that have no rating row yet. Novels not in the map have zero
// ratings.
export async function getRatingSummariesFor(
  novelIds: string[],
): Promise<Map<string, NovelRatingSummary>> {
  if (novelIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("novel_rating_stats")
    .select("novel_id, rating_count, avg_score")
    .in("novel_id", novelIds);

  const map = new Map<string, NovelRatingSummary>();
  for (const row of data ?? []) {
    map.set(row.novel_id, {
      novelId: row.novel_id,
      ratingCount: row.rating_count,
      avgScore: Number(row.avg_score),
    });
  }
  return map;
}

// The current signed-in reader's own rating for a novel, or null if
// they haven't rated it. Guests always get null.
export async function getMyRatingFor(userId: string | null, novelId: string): Promise<number | null> {
  if (!userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("novel_ratings")
    .select("score")
    .eq("user_id", userId)
    .eq("novel_id", novelId)
    .maybeSingle();
  return data ? Number(data.score) : null;
}
