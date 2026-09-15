import { createClient } from "@/lib/supabase/server";
import { getExcludedNovelIdsFromBlockedTags, getBlockedTagIds } from "@/lib/data/blockedTags";
import type { NovelCardData } from "./types";

type SuggestionRow = {
  id: string;
  title: string;
  cover_url: string | null;
  status: "ongoing" | "completed" | "hiatus";
  genre_id: string | null;
  genres: { id: string; name: string; slug: string } | null;
  profiles: { pen_name: string | null } | null;
};

function toCard(row: SuggestionRow): NovelCardData {
  return {
    id: row.id,
    title: row.title,
    cover_url: row.cover_url,
    status: row.status,
    authorPenName: row.profiles?.pen_name ?? null,
    genre: row.genres,
  };
}

// Suggest a small number of novels the reader will probably want to
// read next: prefer ones sharing tags or genre with the finished novel,
// then fall back to trending. Excludes the just-finished novel, the
// reader's blocked tags, and anything they already have in their
// library.
export async function getSuggestionsForNovel(
  novelId: string,
  userId: string | null,
  limit = 3,
): Promise<NovelCardData[]> {
  const supabase = await createClient();

  const [{ data: seedTags }, { data: seedNovel }, blockedTagIds, libraryRows] = await Promise.all([
    supabase.from("novel_tags").select("tag_id").eq("novel_id", novelId),
    supabase.from("novels").select("genre_id").eq("id", novelId).maybeSingle(),
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
  const seedGenreId = seedNovel?.genre_id ?? null;

  // Score candidates by how many seed tags they share, plus a small
  // bump for sharing the seed's genre. Pull a wider pool than we need
  // so filtering can trim it down.
  const candidateIds = new Set<string>();

  if (seedTagIds.length > 0) {
    const { data: byTag } = await supabase
      .from("novel_tags")
      .select("novel_id, tag_id")
      .in("tag_id", seedTagIds);
    const tagCountByNovel = new Map<string, number>();
    for (const row of byTag ?? []) {
      if (excluded.has(row.novel_id)) continue;
      tagCountByNovel.set(row.novel_id, (tagCountByNovel.get(row.novel_id) ?? 0) + 1);
    }
    for (const id of tagCountByNovel.keys()) candidateIds.add(id);
  }

  if (seedGenreId) {
    const { data: byGenre } = await supabase
      .from("novels")
      .select("id")
      .eq("genre_id", seedGenreId)
      .limit(30);
    for (const row of byGenre ?? []) {
      if (!excluded.has(row.id)) candidateIds.add(row.id);
    }
  }

  // Fallback: fill with trending, still filtered.
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

  const [{ data: novels }, { data: tagLinks }, { data: trendingScores }] = await Promise.all([
    supabase
      .from("novels")
      .select("id, title, cover_url, status, genre_id, genres(id,name,slug), profiles(pen_name)")
      .in("id", candidateIdList),
    seedTagIds.length > 0
      ? supabase.from("novel_tags").select("novel_id, tag_id").in("novel_id", candidateIdList).in("tag_id", seedTagIds)
      : Promise.resolve({ data: [] as { novel_id: string; tag_id: string }[] }),
    supabase.from("trending_scores").select("novel_id, score").in("novel_id", candidateIdList),
  ]);

  const seedTagCount = new Map<string, number>();
  for (const row of (tagLinks ?? []) as { novel_id: string; tag_id: string }[]) {
    seedTagCount.set(row.novel_id, (seedTagCount.get(row.novel_id) ?? 0) + 1);
  }
  const trendingScoreByNovel = new Map<string, number>();
  for (const row of trendingScores ?? []) trendingScoreByNovel.set(row.novel_id, row.score);

  const scored = ((novels ?? []) as unknown as SuggestionRow[]).map((n) => {
    let score = (seedTagCount.get(n.id) ?? 0) * 10;
    if (seedGenreId && n.genre_id === seedGenreId) score += 5;
    score += (trendingScoreByNovel.get(n.id) ?? 0) * 0.1;
    return { n, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ n }) => toCard(n));
}
