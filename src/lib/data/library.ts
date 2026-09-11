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
