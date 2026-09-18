import { createClient } from "@/lib/supabase/server";
import type {
  ChapterDetail,
  ChapterSummary,
  Demographic,
  GenreOption,
  NovelCardData,
  NovelDetailData,
  NovelStatus,
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

// SearchSort + SEARCH_SORTS moved to src/lib/browseSort.ts so client
// components can import them without pulling this server-only module.
// Re-exported here for existing call sites.
export { SEARCH_SORTS, type SearchSort } from "@/lib/browseSort";
import type { SearchSort } from "@/lib/browseSort";

export interface SearchNovelsParams {
  query?: string;
  // Genres are many-per-novel; a list means "match ANY of these", which
  // is what a reader browsing "Fantasy or Sci-Fi" expects. Backwards
  // compatible with the old single-slug caller via genreSlug.
  genreSlug?: string;
  genreSlugs?: string[];
  demographic?: Demographic | null;
  statuses?: NovelStatus[];
  includeTagSlugs?: string[];
  excludeTagSlugs?: string[];
  limit?: number;
  sort?: SearchSort;
  excludedNovelIds?: Set<string>;
}

// Resolve one or more genre slugs to the novel ids that carry ANY of
// them. Returns null when NONE of the slugs resolve to a real genre —
// the caller treats that as an empty result.
async function novelIdsForGenreSlugs(genreSlugs: string[]): Promise<Set<string> | null> {
  if (genreSlugs.length === 0) return null;
  const supabase = await createClient();
  const { data: genreRows } = await supabase.from("genres").select("id, slug").in("slug", genreSlugs);
  const ids = (genreRows ?? []).map((g) => g.id);
  if (ids.length === 0) return null;
  const { data: links } = await supabase
    .from("novel_genres")
    .select("novel_id")
    .in("genre_id", ids);
  return new Set((links ?? []).map((l) => l.novel_id));
}

export async function searchNovels({
  query,
  genreSlug,
  genreSlugs,
  demographic,
  statuses,
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

      // Require ALL requested tags: a novel must have every include
      // slug attached to make the cut. Set-per-novel dedup keeps the
      // count honest against any duplicate links.
      const seenByNovel = new Map<string, Set<string>>();
      for (const link of links ?? []) {
        const s = seenByNovel.get(link.novel_id) ?? new Set<string>();
        s.add(link.tag_id);
        seenByNovel.set(link.novel_id, s);
      }
      const includedFromTags = new Set(
        [...seenByNovel.entries()]
          .filter(([, tags]) => tags.size >= includeIds.length)
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

  // A novel carries multiple genres. Choosing several in Browse
  // matches any novel that carries at least one of them. Slug list
  // resolves through the join table.
  const allGenreSlugs = [
    ...(genreSlugs ?? []).filter(Boolean),
    ...(genreSlug ? [genreSlug] : []),
  ];
  if (allGenreSlugs.length > 0) {
    const genreNovelIds = await novelIdsForGenreSlugs(allGenreSlugs);
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

  // Author-pen-name search: resolve pen names first, add them to a
  // novel-id set that ORs with the title match. Kept as one query set
  // rather than a client-side filter so the paging / ordering stay in
  // the DB.
  let matchingAuthorIds: string[] | null = null;
  const trimmedQuery = query?.trim() ?? "";
  if (trimmedQuery.length > 0) {
    const { data: authorRows } = await supabase
      .from("profiles")
      .select("id")
      .ilike("pen_name", `%${trimmedQuery}%`)
      .limit(50);
    matchingAuthorIds = (authorRows ?? []).map((r) => r.id);
  }

  // Score-ordered sorts pull an id list from the stored score table
  // first, then hydrate novel rows in that same order.
  if (sort === "trending" || sort === "most_read" || sort === "top_rated") {
    const table =
      sort === "trending" ? "trending_scores" : sort === "top_rated" ? "top_rated_scores" : "most_read_scores";
    const orderCol =
      sort === "trending" ? "score" : sort === "top_rated" ? "rank_score" : "distinct_readers";
    const { data: scoreRows, error: scoreError } = await supabase
      .from(table)
      .select("novel_id")
      .order(orderCol, { ascending: false })
      .limit(limit * 4);
    if (scoreError) throw scoreError;

    let ids = (scoreRows ?? []).map((r) => r.novel_id).filter((id) => !excludedFromTags.has(id));
    if (includeNovelIds) ids = ids.filter((id) => includeNovelIds!.has(id));
    if (ids.length === 0) return [];

    return hydrateNovelsInOrder(supabase, ids, {
      demographic,
      statuses,
      titleQuery: trimmedQuery,
      matchingAuthorIds,
      limit,
    });
  }

  if (sort === "recently_updated") {
    // Recently updated = novels ordered by their most recent
    // published-chapter time. Same pattern as home's Recently Updated
    // list — pull recent chapters, dedupe by novel_id, then hydrate.
    const { data: recentChapters } = await supabase
      .from("chapters")
      .select("novel_id, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(400);

    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const c of recentChapters ?? []) {
      if (seen.has(c.novel_id) || excludedFromTags.has(c.novel_id)) continue;
      if (includeNovelIds && !includeNovelIds.has(c.novel_id)) continue;
      seen.add(c.novel_id);
      ordered.push(c.novel_id);
      if (ordered.length >= limit * 2) break;
    }
    if (ordered.length === 0) return [];

    return hydrateNovelsInOrder(supabase, ordered, {
      demographic,
      statuses,
      titleQuery: trimmedQuery,
      matchingAuthorIds,
      limit,
    });
  }

  // Default: newest by created_at, filtered in the DB.
  let q = supabase
    .from("novels")
    .select(CARD_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit * 2);
  if (trimmedQuery.length > 0) {
    if (matchingAuthorIds && matchingAuthorIds.length > 0) {
      const idFragment = matchingAuthorIds.map((id) => `"${id}"`).join(",");
      q = q.or(`title.ilike.%${trimmedQuery}%,author_id.in.(${idFragment})`);
    } else {
      q = q.ilike("title", `%${trimmedQuery}%`);
    }
  }
  if (includeNovelIds) q = q.in("id", [...includeNovelIds]);
  if (demographic) q = q.eq("demographic", demographic);
  if (statuses && statuses.length > 0) q = q.in("status", statuses);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? [])
    .map((row) => toCard(row as unknown as NovelRow))
    .filter((n) => !excludedFromTags.has(n.id))
    .slice(0, limit);
}

interface HydrateOpts {
  demographic?: Demographic | null;
  statuses?: NovelStatus[];
  titleQuery: string;
  matchingAuthorIds: string[] | null;
  limit: number;
}

// Given an ordered list of novel ids from a score-based query, load
// the full card rows, apply the remaining DB-side filters
// (demographic, status, title/author query), and return the results
// in the input order, capped at `limit`.
async function hydrateNovelsInOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
  { demographic, statuses, titleQuery, matchingAuthorIds, limit }: HydrateOpts,
): Promise<NovelCardData[]> {
  let novelsQ = supabase.from("novels").select(CARD_SELECT).in("id", ids);
  if (titleQuery.length > 0) {
    if (matchingAuthorIds && matchingAuthorIds.length > 0) {
      const idFragment = matchingAuthorIds.map((id) => `"${id}"`).join(",");
      novelsQ = novelsQ.or(`title.ilike.%${titleQuery}%,author_id.in.(${idFragment})`);
    } else {
      novelsQ = novelsQ.ilike("title", `%${titleQuery}%`);
    }
  }
  if (demographic) novelsQ = novelsQ.eq("demographic", demographic);
  if (statuses && statuses.length > 0) novelsQ = novelsQ.in("status", statuses);

  const { data: novels, error } = await novelsQ;
  if (error) throw error;
  const byId = new Map(
    ((novels ?? []) as unknown as NovelRow[]).map((row) => [row.id, toCard(row)]),
  );
  const results: NovelCardData[] = [];
  for (const id of ids) {
    const n = byId.get(id);
    if (n) results.push(n);
    if (results.length >= limit) break;
  }
  return results;
}

export async function getNovelById(novelId: string): Promise<NovelDetailData | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("novels")
    .select(
      "id, title, cover_url, status, synopsis, author_id, created_at, demographic, novel_genres(genres(id,name,slug)), profiles(pen_name), novel_tags(tags(id,name,slug,is_approved,tag_group))",
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
    .select("id, title, order_number, is_published, published_at, publish_at, volume_id")
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
    .select(
      "id, novel_id, title, body, paragraphs, author_note_top, author_note_bottom, publish_at, volume_id, order_number, is_published, published_at",
    )
    .eq("novel_id", novelId)
    .eq("id", chapterId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as ChapterDetail | null;
}

// Other novels by the same author, most recent first. Used on the
// novel page (small "more from this author" strip) and on the author
// profile page. Drafts stay hidden by RLS; unpublished-status novels
// still appear, since a hiatus or completed one is still a real novel.
export async function getOtherNovelsByAuthor(
  authorId: string,
  excludeNovelId: string,
  limit = 6,
): Promise<NovelCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("novels")
    .select(CARD_SELECT)
    .eq("author_id", authorId)
    .neq("id", excludeNovelId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => toCard(row as unknown as NovelRow));
}

// Distinct-reader count for a novel, straight off the same table Most
// Read reads from. Returns null when the novel has no row (no reads
// recorded yet); the caller then just doesn't render the metric.
export async function getReaderCountForNovel(novelId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("most_read_scores")
    .select("distinct_readers")
    .eq("novel_id", novelId)
    .maybeSingle();
  if (error) return null;
  return data ? Number(data.distinct_readers) : null;
}

// The author's public pen name. Profiles are publicly readable per
// migration 0001; this is the query the author-profile page uses.
export async function getAuthorPenName(authorId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("pen_name")
    .eq("id", authorId)
    .maybeSingle();
  if (error) return null;
  return data?.pen_name ?? null;
}

// Public profile fields used by /authors/[authorId]. Reads only what's
// safe to show any visitor.
export interface PublicProfileData {
  id: string;
  pen_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  links: Array<{ label?: string | null; url: string }>;
  deleted_at: string | null;
}

export async function getPublicProfile(authorId: string): Promise<PublicProfileData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, pen_name, avatar_url, bio, links, deleted_at")
    .eq("id", authorId)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  return {
    id: data.id,
    pen_name: data.pen_name,
    avatar_url: data.avatar_url,
    bio: data.bio,
    links: Array.isArray(data.links)
      ? (data.links as Array<{ label?: string | null; url: string }>)
      : [],
    deleted_at: data.deleted_at,
  };
}

// Every novel the given author has written, most recent first, in the
// same card shape used on Home / Browse. Used by the author-profile
// page — includes drafts only when the viewer IS that author (RLS
// enforces that; the query itself doesn't need special-casing).
export async function getNovelsByAuthor(authorId: string): Promise<NovelCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("novels")
    .select(CARD_SELECT)
    .eq("author_id", authorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => toCard(row as unknown as NovelRow));
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
