import { createClient } from "@/lib/supabase/server";
import type { NovelCardData, NovelStatus } from "./types";

export interface LibraryItem {
  novel: NovelCardData;
  hasUnread: boolean;
}

type LibraryNovelRow = {
  id: string;
  title: string;
  cover_url: string | null;
  status: NovelStatus;
  genres: { id: string; name: string; slug: string } | null;
  profiles: { pen_name: string | null } | null;
};

export async function getLibrary(userId: string): Promise<LibraryItem[]> {
  const supabase = await createClient();

  const { data: entries, error } = await supabase
    .from("library_entries")
    .select("novel_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!entries || entries.length === 0) return [];

  const novelIds = entries.map((e) => e.novel_id);

  const [{ data: novels, error: novelsError }, { data: progress }, { data: chapterCounts }] = await Promise.all([
    supabase
      .from("novels")
      .select("id, title, cover_url, status, synopsis, author_id, created_at, genres(id,name,slug), profiles(pen_name)")
      .in("id", novelIds),
    supabase
      .from("reading_progress")
      .select("novel_id, chapters(order_number)")
      .eq("user_id", userId)
      .in("novel_id", novelIds),
    supabase.from("chapters").select("novel_id, order_number").eq("is_published", true).in("novel_id", novelIds),
  ]);

  if (novelsError) throw novelsError;

  const latestOrderByNovel = new Map<string, number>();
  for (const c of chapterCounts ?? []) {
    const current = latestOrderByNovel.get(c.novel_id) ?? -1;
    if (c.order_number > current) latestOrderByNovel.set(c.novel_id, c.order_number);
  }

  const lastReadOrderByNovel = new Map<string, number>();
  for (const p of (progress ?? []) as unknown as { novel_id: string; chapters: { order_number: number } | null }[]) {
    if (p.chapters) lastReadOrderByNovel.set(p.novel_id, p.chapters.order_number);
  }

  const novelsById = new Map(
    ((novels ?? []) as unknown as LibraryNovelRow[]).map((n) => [n.id, n]),
  );

  const items: LibraryItem[] = [];
  for (const novelId of novelIds) {
    const novel = novelsById.get(novelId);
    if (!novel) continue;

    const latestOrder = latestOrderByNovel.get(novelId) ?? -1;
    const lastReadOrder = lastReadOrderByNovel.get(novelId) ?? -1;
    const hasUnread = latestOrder > lastReadOrder;

    items.push({
      novel: {
        id: novel.id,
        title: novel.title,
        cover_url: novel.cover_url,
        status: novel.status,
        authorPenName: novel.profiles?.pen_name ?? null,
        genre: novel.genres,
      },
      hasUnread,
    });
  }

  return items;
}

export interface UpdateItem {
  novel: NovelCardData;
  unreadCount: number;
  latestChapterAt: string; // published_at of the newest published chapter
}

// For the Updates page. Same source of truth as the library:
// reading_progress + published chapters. Only novels with at least one
// unread chapter are returned, newest-updated first.
export async function getLibraryUpdates(userId: string): Promise<UpdateItem[]> {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("library_entries")
    .select("novel_id")
    .eq("user_id", userId);
  const novelIds = (entries ?? []).map((e) => e.novel_id);
  if (novelIds.length === 0) return [];

  const [
    { data: novels, error: novelsError },
    { data: progress },
    { data: publishedChapters, error: chaptersError },
  ] = await Promise.all([
    supabase
      .from("novels")
      .select("id, title, cover_url, status, synopsis, author_id, created_at, genres(id,name,slug), profiles(pen_name)")
      .in("id", novelIds),
    supabase
      .from("reading_progress")
      .select("novel_id, chapters(order_number)")
      .eq("user_id", userId)
      .in("novel_id", novelIds),
    supabase
      .from("chapters")
      .select("novel_id, order_number, published_at")
      .eq("is_published", true)
      .in("novel_id", novelIds),
  ]);

  if (novelsError) throw novelsError;
  if (chaptersError) throw chaptersError;

  const lastReadOrderByNovel = new Map<string, number>();
  for (const p of (progress ?? []) as unknown as { novel_id: string; chapters: { order_number: number } | null }[]) {
    if (p.chapters) lastReadOrderByNovel.set(p.novel_id, p.chapters.order_number);
  }

  // Count unread chapters + track the newest published_at per novel.
  const unreadCountByNovel = new Map<string, number>();
  const newestByNovel = new Map<string, string>();
  for (const c of publishedChapters ?? []) {
    const lastRead = lastReadOrderByNovel.get(c.novel_id) ?? -1;
    if (c.order_number > lastRead) {
      unreadCountByNovel.set(c.novel_id, (unreadCountByNovel.get(c.novel_id) ?? 0) + 1);
    }
    if (c.published_at) {
      const current = newestByNovel.get(c.novel_id);
      if (!current || c.published_at > current) newestByNovel.set(c.novel_id, c.published_at);
    }
  }

  const novelsById = new Map(
    ((novels ?? []) as unknown as LibraryNovelRow[]).map((n) => [n.id, n]),
  );

  const items: UpdateItem[] = [];
  for (const novelId of novelIds) {
    const unread = unreadCountByNovel.get(novelId) ?? 0;
    if (unread === 0) continue;
    const novel = novelsById.get(novelId);
    if (!novel) continue;
    items.push({
      novel: {
        id: novel.id,
        title: novel.title,
        cover_url: novel.cover_url,
        status: novel.status,
        authorPenName: novel.profiles?.pen_name ?? null,
        genre: novel.genres,
      },
      unreadCount: unread,
      latestChapterAt: newestByNovel.get(novelId) ?? "",
    });
  }

  items.sort((a, b) => b.latestChapterAt.localeCompare(a.latestChapterAt));
  return items;
}

export async function isInLibrary(userId: string, novelId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("novel_id", novelId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
