import { createClient } from "@/lib/supabase/server";
import { getExcludedNovelIdsFromBlockedTags, getBlockedTagIds } from "@/lib/data/blockedTags";
import { CARD_SELECT, toCard, type NovelRow } from "./novels";
import type { NovelCardData } from "./types";

// Suggest a small number of novels the reader will probably want to
// read next: prefer ones sharing tags or any genre with the finished
// novel (a novel can now carry several genres — a candidate scores a
// bump per overlapping genre, not just for matching a single genre).
// Excludes the just-finished novel, the reader's blocked tags, and
// anything they already have in their library.
export async function getSuggestionsForNovel(
  novelId: string,
  userId: string | null,
  limit = 3,
): Promise<NovelCardData[]> {
  const supabase = await createClient();

  const [{ data: seedTags }, { data: seedGenres }, blockedTagIds, libraryRows] = await Promise.all([
    supabase.from("novel_tags").select("tag_id").eq("novel_id", novelId),
    supabase.from("novel_genres").select("genre_id").eq("novel_id", novelId),
    getBlockedTagIds(userId),
    userId
      ? supabase.from("library_entries").select("novel_id").eq("user_id", userId)
      : Promise.resolve({ data: [] as { novel_id: string }[] }),
  ]);

  const [excludedByBlockedTags, libraryNovelIds] = [
    await getExcludedNovelIdsFromBlockedTags(blockedTagIds),
    new Set(((libraryRows.data ?? []) as { novel_id: string }[]).map((r) => r.novel_id)),
  ];

  const excluded = new Set<string>([novelId, ...excludedByBlockedTags, ...libraryNovelIds]);

  const seedTagIds = (seedTags ?? []).map((r) => r.tag_id);
  const seedGenreIds = (seedGenres ?? []).map((r) => r.genre_id);

  const candidateIds = new Set<string>();

  if (seedTagIds.length > 0) {
    const { data: byTag } = await supabase
      .from("novel_tags")
      .select("novel_id, tag_id")
      .in("tag_id", seedTagIds);
    for (const row of byTag ?? []) {
      if (!excluded.has(row.novel_id)) candidateIds.add(row.novel_id);
    }
  }

  if (seedGenreIds.length > 0) {
    const { data: byGenre } = await supabase
      .from("novel_genres")
      .select("novel_id, genre_id")
      .in("genre_id", seedGenreIds);
    for (const row of byGenre ?? []) {
      if (!excluded.has(row.novel_id)) candidateIds.add(row.novel_id);
    }
  }

  if (candidateIds.size < limit * 4) {
    const { data: trending } = await supabase
      .from("trending_scores")
      .select("novel_id")
      .order("score", { ascending: false })
      .limit(40);
    for (const row of trending ?? []) {
      if (!excluded.has(row.novel_id)) candidateIds.add(row.novel_id);
      if (candidateIds.size >= limit * 6) break;
    }
  }

  if (candidateIds.size === 0) return [];

  const candidateIdList = [...candidateIds];

  const [{ data: novels }, { data: tagLinks }, { data: candidateGenres }, { data: trendingScores }] = await Promise.all([
    supabase.from("novels").select(CARD_SELECT).in("id", candidateIdList),
    seedTagIds.length > 0
      ? supabase
          .from("novel_tags")
          .select("novel_id, tag_id")
          .in("novel_id", candidateIdList)
          .in("tag_id", seedTagIds)
      : Promise.resolve({ data: [] as { novel_id: string; tag_id: string }[] }),
    seedGenreIds.length > 0
      ? supabase
          .from("novel_genres")
          .select("novel_id, genre_id")
          .in("novel_id", candidateIdList)
          .in("genre_id", seedGenreIds)
      : Promise.resolve({ data: [] as { novel_id: string; genre_id: string }[] }),
    supabase.from("trending_scores").select("novel_id, score").in("novel_id", candidateIdList),
  ]);

  const sharedTagCount = new Map<string, number>();
  for (const row of (tagLinks ?? []) as { novel_id: string; tag_id: string }[]) {
    sharedTagCount.set(row.novel_id, (sharedTagCount.get(row.novel_id) ?? 0) + 1);
  }

  const sharedGenreCount = new Map<string, number>();
  for (const row of (candidateGenres ?? []) as { novel_id: string; genre_id: string }[]) {
    sharedGenreCount.set(row.novel_id, (sharedGenreCount.get(row.novel_id) ?? 0) + 1);
  }

  const trendingScoreByNovel = new Map<string, number>();
  for (const row of trendingScores ?? []) trendingScoreByNovel.set(row.novel_id, row.score);

  const scored = ((novels ?? []) as unknown as NovelRow[]).map((n) => {
    let score = (sharedTagCount.get(n.id) ?? 0) * 10;
    score += (sharedGenreCount.get(n.id) ?? 0) * 5;
    score += (trendingScoreByNovel.get(n.id) ?? 0) * 0.1;
    return { n, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ n }) => toCard(n));
}
