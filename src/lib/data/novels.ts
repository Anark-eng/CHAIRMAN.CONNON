import { createClient } from "@/lib/supabase/server";
import type {
  ChapterDetail,
  ChapterSummary,
  Demographic,
  GenreOption,
  NovelCardData,
  NovelDetailData,
  TagOption,
} from "./types";

// A novel row shaped for card rendering. novel_genres → genres gives
// us the many-genre list; profiles carries the author's pen name.
export type NovelRow = {
  id: string;
  title: string;
  cover_url: string | null;
  status: "ongoing" | "completed" | "hiatus";
  synopsis: string;
  author_id: string;
  demographic: Demographic | null;
  created_at: string;
  novel_genres: { genres: GenreOption | null }[] | null;
  profiles: { pen_name: string | null } | null;
};

export function novelGenres(row: Pick<NovelRow, "novel_genres">): GenreOption[] {
  return (row.novel_genres ?? [])
    .map((ng) => ng.genres)
    .filter((g): g is GenreOption => Boolean(g));
}

export function toCard(row: NovelRow): NovelCardData {
  return {
    id: row.id,
    title: row.title,
    cover_url: row.cover_url,
    status: row.status,
    authorPenName: row.profiles?.pen_name ?? null,
    demographic: row.demographic ?? null,
    genres: novelGenres(row),
  };
}

// The row shape used across all list queries. Multiple genres come
// through the join table.
export const CARD_SELECT =
  "id, title, cover_url, status, synopsis, author_id, created_at, demographic, novel_genres(genres(id,name,slug)), profiles(pen_name)";

export interface WithBlocklist {
  excludedNovelIds?: Set<string>;
}

function applyBlocklist<R extends { id: string }>(
  rows: R[],
  excluded: Set<string> | undefined,
): R[] {
  if (!excluded || excluded.size === 0) return rows;
  return rows.filter((r) => !excluded.has(r.id));
}

function buildExcludeIdFilter(excluded: Set<string> | undefined, limit = 50): string | null {
  if (!excluded || excluded.size === 0) return null;
  if (excluded.size > limit) return null;
  return `(${[...excluded].join(",")})`;
}

export async function getNewlyAddedNovels(
  limit = 12,
  opts: WithBlocklist = {},
): Promise<NovelCardData[]> {
  const supabase = await createClient();
  let q = supabase
    .from("novels")
    .select(CARD_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit + (opts.excludedNovelIds?.size ?? 0));

  const exclude = buildExcludeIdFilter(opts.excludedNovelIds);
  if (exclude) q = q.not("id", "in", exclude);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map((row) => toCard(row as unknown as NovelRow));
  return applyBlocklist(rows, opts.excludedNovelIds).slice(0, limit);
}

export async function getRecentlyUpdatedNovels(
  limit = 12,
  opts: WithBlocklist = {},
): Promise<NovelCardData[]> {
  const supabase = await createClient();

  const { data: recentChapters, error: chaptersError } = await supabase
    .from("chapters")
    .select("novel_id, published_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(400);

  if (chaptersError) throw chaptersError;

  const excluded = opts.excludedNovelIds;
  const orderedNovelIds: string[] = [];
  for (const chapter of recentChapters ?? []) {
    if (excluded?.has(chapter.novel_id)) continue;
    if (!orderedNovelIds.includes(chapter.novel_id)) {
      orderedNovelIds.push(chapter.novel_id);
    }
    if (orderedNovelIds.length >= limit) break;
  }

  if (orderedNovelIds.length === 0) return [];

  const { data: novels, error: novelsError } = await supabase
    .from("novels")
    .select(CARD_SELECT)
    .in("id", orderedNovelIds);

  if (novelsError) throw novelsError;

  const byId = new Map(
    ((novels ?? []) as unknown as NovelRow[]).map((row) => [row.id, toCard(row)]),
  );
  return orderedNovelIds.map((id) => byId.get(id)).filter((n): n is NovelCardData => Boolean(n));
}

export async function getTrendingNovels(
  limit = 12,
  opts: WithBlocklist = {},
): Promise<NovelCardData[]> {
  const supabase = await createClient();

  const { data: scoreRows, error: scoreError } = await supabase
    .from("trending_scores")
    .select("novel_id")
    .order("score", { ascending: false })
    .limit(limit + (opts.excludedNovelIds?.size ?? 0));

  if (scoreError) throw scoreError;

  const excluded = opts.excludedNovelIds;
  const orderedIds = (scoreRows ?? [])
    .map((r) => r.novel_id)
    .filter((id) => !excluded?.has(id))
    .slice(0, limit);
  if (orderedIds.length === 0) return [];

  const { data: novels, error: novelsError } = await supabase
    .from("novels")
    .select(CARD_SELECT)
    .in("id", orderedIds);

  if (novelsError) throw novelsError;

  const byId = new Map(
    ((novels ?? []) as unknown as NovelRow[]).map((row) => [row.id, toCard(row)]),
  );
  return orderedIds.map((id) => byId.get(id)).filter((n): n is NovelCardData => Boolean(n));
}

export type SearchSort = "newest" | "trending";

export interface SearchNovelsParams {
  query?: string;
  genreSlug?: string;
  includeTagSlugs?: string[];
  excludeTagSlugs?: string[];
  limit?: number;
  sort?: SearchSort;
  excludedNovelIds?: Set<string>;
}

// Resolve a genre slug to the set of novel ids carrying that genre.
// Returns null if the slug doesn't match any genre (caller returns []).
async function novelIdsForGenreSlug(genreSlug: string): Promise<Set<string> | null> {
  const supabase = await createClient();
  const { data: genreRow } = await supabase.from("genres").select("id").eq("slug", genreSlug).maybeSingle();
  if (!genreRow) return null;
  const { data: links } = await supabase
    .from("novel_genres")
    .select("novel_id")
    .eq("genre_id", genreRow.id);
  return new Set((links ?? []).map((l) => l.novel_id));
}

export async function searchNovels({
  query,
  genreSlug,
  includeTagSlugs = [],
  excludeTagSlugs = [],
  limit = 40,
  sort = "newest",
  excludedNovelIds,
}: SearchNovelsParams): Promise<NovelCardData[]> {
  const supabase = await createClient();

  // Resolve tag slugs to ids up front, then merge with the caller's
  // (blocked-tag) excludedNovelIds so both filters apply in one pass.
  let includeNovelIds: Set<string> | null = null;
  const excludedFromTags: Set<string> = new Set(excludedNovelIds ?? []);

  if (includeTagSlugs.length > 0 || excludeTagSlugs.length > 0) {
    const { data: tagRows, error: tagError } = await supabase
      .from("tags")
      .select("id, slug")
      .in("slug", [...includeTagSlugs, ...excludeTagSlugs]);
    if (tagError) throw tagError;

    const includeIds = (tagRows ?? []).filter((t) => includeTagSlugs.includes(t.slug)).map((t) => t.id);
    const excludeIds = (tagRows ?? []).filter((t) => excludeTagSlugs.includes(t.slug)).map((t) => t.id);

    if (includeIds.length > 0) {
      const { data: links, error: linkError } = await supabase
        .from("novel_tags")
        .select("novel_id, tag_id")
        .in("tag_id", includeIds);
      if (linkError) throw linkError;

      const countByNovel = new Map<string, number>();
      for (const link of links ?? []) {
        countByNovel.set(link.novel_id, (countByNovel.get(link.novel_id) ?? 0) + 1);
      }
      const includedFromTags = new Set(
        [...countByNovel.entries()]
          .filter(([, count]) => count >= includeIds.length)
          .map(([id]) => id),
      );

      if (includedFromTags.size === 0) return [];
      includeNovelIds = includedFromTags;
    }

    if (excludeIds.length > 0) {
      const { data: excludedLinks, error: excludedError } = await supabase
        .from("novel_tags")
        .select("novel_id")
        .in("tag_id", excludeIds);
      if (excludedError) throw excludedError;
      for (const l of excludedLinks ?? []) excludedFromTags.add(l.novel_id);
    }
  }

  // A novel now carries several genres. Choosing a genre in Browse finds
  // every novel that carries it — resolve slug → id set via the join
  // table, then intersect with any tag-based inclusion.
  if (genreSlug) {
    const genreNovelIds = await novelIdsForGenreSlug(genreSlug);
    if (genreNovelIds === null || genreNovelIds.size === 0) return [];
    if (includeNovelIds === null) {
      includeNovelIds = genreNovelIds;
    } else {
      const intersect = new Set<string>();
      for (const id of includeNovelIds) if (genreNovelIds.has(id)) intersect.add(id);
      if (intersect.size === 0) return [];
      includeNovelIds = intersect;
    }
  }

  if (sort === "trending") {
    const { data: scoreRows, error: scoreError } = await supabase
      .from("trending_scores")
      .select("novel_id")
      .order("score", { ascending: false })
      .limit(limit * 4);
    if (scoreError) throw scoreError;

    let ids = (scoreRows ?? []).map((r) => r.novel_id).filter((id) => !excludedFromTags.has(id));
    if (includeNovelIds) ids = ids.filter((id) => includeNovelIds!.has(id));
    ids = ids.slice(0, limit);
    if (ids.length === 0) return [];

    let novelsQ = supabase.from("novels").select(CARD_SELECT).in("id", ids);
    if (query && query.trim().length > 0) novelsQ = novelsQ.ilike("title", `%${query.trim()}%`);
    const { data: novels, error: novelsError } = await novelsQ;
    if (novelsError) throw novelsError;
    const byId = new Map(
      ((novels ?? []) as unknown as NovelRow[]).map((row) => [row.id, toCard(row)]),
    );
    return ids.map((id) => byId.get(id)).filter((n): n is NovelCardData => Boolean(n));
  }

  let q = supabase.from("novels").select(CARD_SELECT).order("created_at", { ascending: false }).limit(limit);
  if (query && query.trim().length > 0) q = q.ilike("title", `%${query.trim()}%`);
  if (includeNovelIds) q = q.in("id", [...includeNovelIds]);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? [])
    .map((row) => toCard(row as unknown as NovelRow))
    .filter((n) => !excludedFromTags.has(n.id));
}

export async function getNovelById(novelId: string): Promise<NovelDetailData | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("novels")
    .select(
      "id, title, cover_url, status, synopsis, author_id, created_at, demographic, novel_genres(genres(id,name,slug)), profiles(pen_name), novel_tags(tags(id,name,slug,is_approved))",
    )
    .eq("id", novelId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as NovelRow & { novel_tags: { tags: TagOption }[] };

  return {
    ...toCard(row),
    synopsis: row.synopsis,
    author_id: row.author_id,
    created_at: row.created_at,
    tags: (row.novel_tags ?? []).map((nt) => nt.tags).filter(Boolean),
  };
}

export async function getChaptersForNovel(
  novelId: string,
  { includeDrafts }: { includeDrafts: boolean },
): Promise<ChapterSummary[]> {
  const supabase = await createClient();
  let q = supabase
    .from("chapters")
    .select("id, title, order_number, is_published, published_at")
    .eq("novel_id", novelId)
    .order("order_number", { ascending: true });

  if (!includeDrafts) q = q.eq("is_published", true);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getChapter(novelId: string, chapterId: string): Promise<ChapterDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chapters")
    .select("id, novel_id, title, body, order_number, is_published, published_at")
    .eq("novel_id", novelId)
    .eq("id", chapterId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getMyNovels(authorId: string) {
  const supabase = await createClient();
  const { data: novels, error } = await supabase
    .from("novels")
    .select("id, title, cover_url, status, created_at")
    .eq("author_id", authorId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!novels || novels.length === 0) return [];

  const { data: chapterCounts, error: countError } = await supabase
    .from("chapters")
    .select("novel_id")
    .in("novel_id", novels.map((n) => n.id));

  if (countError) throw countError;

  const counts = new Map<string, number>();
  for (const c of chapterCounts ?? []) {
    counts.set(c.novel_id, (counts.get(c.novel_id) ?? 0) + 1);
  }

  return novels.map((n) => ({ ...n, chapterCount: counts.get(n.id) ?? 0 }));
}
