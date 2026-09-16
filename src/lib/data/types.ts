import type { Demographic, NovelStatus } from "@/lib/supabase/database.types";

export type { Demographic, NovelStatus };

export interface GenreOption {
  id: string;
  name: string;
  slug: string;
}

export interface TagOption {
  id: string;
  name: string;
  slug: string;
  is_approved?: boolean;
}

export interface NovelCardData {
  id: string;
  title: string;
  cover_url: string | null;
  status: NovelStatus;
  authorPenName: string | null;
  demographic: Demographic | null;
  genres: GenreOption[];
}

export interface NovelDetailData extends NovelCardData {
  synopsis: string;
  author_id: string;
  created_at: string;
  tags: TagOption[];
}

export interface ChapterSummary {
  id: string;
  title: string;
  order_number: number;
  is_published: boolean;
  published_at: string | null;
  publish_at?: string | null;
  volume_id?: string | null;
}

export interface ChapterDetail extends ChapterSummary {
  novel_id: string;
  body: string;
  paragraphs: unknown; // Paragraph[] — consumer casts via chapterContent types
  author_note_top: string | null;
  author_note_bottom: string | null;
  publish_at: string | null;
  volume_id: string | null;
}
