import { createClient } from "@/lib/supabase/server";
import type {
  ChapterDetail,
  ChapterSummary,
  NovelCardData,
  NovelDetailData,
  TagOption,
} from "./types";

type NovelRow = {
  id: string;
  title: string;
  cover_url: string | null;
  status: "ongoing" | "completed" | "hiatus";
  synopsis: string;
  author_id: string;
  created_at: string;
  genres: { id: string; name: string; slug: string } | null;
  profiles: { pen_name: string | null } | null;
};

function toCard(row: NovelRow): NovelCardData {
  return {
    id: row.id,
    title: row.title,
    cover_url: row.cover_url,
    status: row.status,
    authorPenName: row.profiles?.pen_name ?? null,
    genre: row.genres,
  };
}

const CARD_SELECT = "id, title, cover_url, status, synopsis, author_id, created_at, genres(id,name,slug), profiles(pen_name)";

export async function getNewlyAddedNovels(limit = 12): Promise<NovelCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("novels")
    .select(CARD_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => toCard(row as unknown as NovelRow));
}

export async function getRecentlyUpdatedNovels(limit = 12): Promise<NovelCardData[]> {
  const supabase = await createClient();

  const { data: recentChapters, error: chaptersError } = await supabase
    .from("chapters")
    .select("novel_id, published_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(200);

  if (chaptersError) throw chaptersError;

  const orderedNovelIds: string[] = [];
  for (const chapter of recentChapters ?? []) {
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

export interface SearchNovelsParams {
  query?: string;
  genreSlug?: string;
  includeTagSlugs?: string[];
  excludeTagSlugs?: string[];
  limit?: number;
}

export async function searchNovels({
  query,
  genreSlug,
  includeTagSlugs = [],
  excludeTagSlugs = [],
  limit = 40,
}: SearchNovelsParams): Promise<NovelCardData[]> {
  const supabase = await createClient();

  // Resolve tag slugs to ids up front.
  let includeNovelIds: string[] | null = null;
  let excludedNovelIds: Set<string> = new Set();

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
      includeNovelIds = [...countByNovel.entries()]
        .filter(([, count]) => count >= includeIds.length)
        .map(([id]) => id);

      if (includeNovelIds.length === 0) return [];
    }

    if (excludeIds.length > 0) {
      const { data: excludedLinks, error: excludedError } = await supabase
        .from("novel_tags")
        .select("novel_id")
        .in("tag_id", excludeIds);
      if (excludedError) throw excludedError;
      excludedNovelIds = new Set((excludedLinks ?? []).map((l) => l.novel_id));
    }
  }

  let q = supabase.from("novels").select(CARD_SELECT).order("created_at", { ascending: false }).limit(limit);

  if (query && query.trim().length > 0) {
    q = q.ilike("title", `%${query.trim()}%`);
  }
  if (genreSlug) {
    const { data: genreRow } = await supabase.from("genres").select("id").eq("slug", genreSlug).maybeSingle();
    if (!genreRow) return [];
    q = q.eq("genre_id", genreRow.id);
  }
  if (includeNovelIds) {
    q = q.in("id", includeNovelIds);
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? [])
    .map((row) => toCard(row as unknown as NovelRow))
    .filter((n) => !excludedNovelIds.has(n.id));
}

export async function getNovelById(novelId: string): Promise<NovelDetailData | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("novels")
    .select(
      "id, title, cover_url, status, synopsis, author_id, created_at, genres(id,name,slug), profiles(pen_name), novel_tags(tags(id,name,slug))",
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

  if (!includeDrafts) {
    q = q.eq("is_published", true);
  }

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
