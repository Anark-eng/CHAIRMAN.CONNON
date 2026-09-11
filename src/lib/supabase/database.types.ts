// Hand-written types that mirror supabase/migrations/0001_init.sql.
// If you change the SQL schema, update this file to match.

export type NovelStatus = "ongoing" | "completed" | "hiatus";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          pen_name: string | null;
          is_author: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          pen_name?: string | null;
          is_author?: boolean;
        };
        Update: {
          pen_name?: string | null;
          is_author?: boolean;
        };
        Relationships: [];
      };
      genres: {
        Row: { id: string; name: string; slug: string };
        Insert: { id?: string; name: string; slug: string };
        Update: { name?: string; slug?: string };
        Relationships: [];
      };
      tags: {
        Row: { id: string; name: string; slug: string };
        Insert: { id?: string; name: string; slug: string };
        Update: { name?: string; slug?: string };
        Relationships: [];
      };
      novels: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          synopsis: string;
          cover_url: string | null;
          genre_id: string | null;
          status: NovelStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          title: string;
          synopsis?: string;
          cover_url?: string | null;
          genre_id?: string | null;
          status?: NovelStatus;
        };
        Update: {
          title?: string;
          synopsis?: string;
          cover_url?: string | null;
          genre_id?: string | null;
          status?: NovelStatus;
        };
        Relationships: [];
      };
      novel_tags: {
        Row: { novel_id: string; tag_id: string };
        Insert: { novel_id: string; tag_id: string };
        Update: { novel_id?: string; tag_id?: string };
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string;
          novel_id: string;
          title: string;
          body: string;
          order_number: number;
          is_published: boolean;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          novel_id: string;
          title: string;
          body?: string;
          order_number: number;
          is_published?: boolean;
          published_at?: string | null;
        };
        Update: {
          title?: string;
          body?: string;
          order_number?: number;
          is_published?: boolean;
          published_at?: string | null;
        };
        Relationships: [];
      };
      library_entries: {
        Row: { id: string; user_id: string; novel_id: string; created_at: string };
        Insert: { id?: string; user_id: string; novel_id: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      reading_progress: {
        Row: {
          id: string;
          user_id: string;
          novel_id: string;
          chapter_id: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          novel_id: string;
          chapter_id: string;
          updated_at?: string;
        };
        Update: {
          chapter_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
