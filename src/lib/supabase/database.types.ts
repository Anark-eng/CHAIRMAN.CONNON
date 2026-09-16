// Hand-written types that mirror supabase/migrations/0001_init.sql.
// If you change the SQL schema, update this file to match.

export type NovelStatus = "ongoing" | "completed" | "hiatus";

export type Demographic = "shounen" | "shoujo" | "seinen" | "josei" | "general";

export type ReactionType =
  | "shocked"
  | "heartbreak"
  | "laughed"
  | "goosebumps"
  | "best_line"
  | "confused";

export const REACTION_TYPES: ReactionType[] = [
  "shocked",
  "heartbreak",
  "laughed",
  "goosebumps",
  "best_line",
  "confused",
];

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
        Row: { id: string; name: string; slug: string; is_approved: boolean };
        Insert: { id?: string; name: string; slug: string; is_approved?: boolean };
        Update: { name?: string; slug?: string; is_approved?: boolean };
        Relationships: [];
      };
      novels: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          synopsis: string;
          cover_url: string | null;
          demographic: Demographic | null;
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
          demographic?: Demographic | null;
          status?: NovelStatus;
        };
        Update: {
          title?: string;
          synopsis?: string;
          cover_url?: string | null;
          demographic?: Demographic | null;
          status?: NovelStatus;
        };
        Relationships: [];
      };
      novel_genres: {
        Row: { novel_id: string; genre_id: string; created_at: string };
        Insert: { novel_id: string; genre_id: string };
        Update: Record<string, never>;
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
      paragraph_reactions: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string;
          paragraph_index: number;
          reaction_type: ReactionType;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chapter_id: string;
          paragraph_index: number;
          reaction_type: ReactionType;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      paragraph_reaction_counts: {
        Row: {
          chapter_id: string;
          paragraph_index: number;
          shocked: number;
          heartbreak: number;
          laughed: number;
          goosebumps: number;
          best_line: number;
          confused: number;
          total: number;
        };
        Insert: {
          chapter_id: string;
          paragraph_index: number;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      paragraph_comments: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string;
          paragraph_index: number;
          body: string;
          is_spoiler: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chapter_id: string;
          paragraph_index: number;
          body: string;
          is_spoiler?: boolean;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      chapter_reads: {
        Row: {
          id: string;
          chapter_id: string;
          novel_id: string;
          user_id: string | null;
          guest_key: string | null;
          read_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          novel_id: string;
          user_id?: string | null;
          guest_key?: string | null;
          read_date?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      blocked_tags: {
        Row: { user_id: string; tag_id: string; created_at: string };
        Insert: { user_id: string; tag_id: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      trending_scores: {
        Row: {
          novel_id: string;
          score: number;
          weighted_now: number;
          weighted_prev: number;
          reads_now: number;
          reads_prev: number;
          library_now: number;
          library_prev: number;
          reactions_now: number;
          comments_now: number;
          computed_at: string;
        };
        Insert: {
          novel_id: string;
          score: number;
          weighted_now: number;
          weighted_prev: number;
          reads_now?: number;
          reads_prev?: number;
          library_now?: number;
          library_prev?: number;
          reactions_now?: number;
          comments_now?: number;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      chapter_comments: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string;
          parent_id: string | null;
          body: string;
          is_spoiler: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chapter_id: string;
          parent_id?: string | null;
          body: string;
          is_spoiler?: boolean;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      novel_ratings: {
        Row: {
          id: string;
          user_id: string;
          novel_id: string;
          score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          novel_id: string;
          score: number;
        };
        Update: {
          score?: number;
        };
        Relationships: [];
      };
      novel_rating_stats: {
        Row: {
          novel_id: string;
          rating_count: number;
          rating_sum: number;
          avg_score: number;
          updated_at: string;
        };
        Insert: {
          novel_id: string;
          rating_count?: number;
          rating_sum?: number;
          avg_score?: number;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      top_rated_scores: {
        Row: {
          novel_id: string;
          rank_score: number;
          avg_score: number;
          rating_count: number;
          computed_at: string;
        };
        Insert: {
          novel_id: string;
          rank_score: number;
          avg_score: number;
          rating_count: number;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      most_read_scores: {
        Row: {
          novel_id: string;
          distinct_readers: number;
          computed_at: string;
        };
        Insert: {
          novel_id: string;
          distinct_readers: number;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_chapter_read: {
        Args: { p_chapter_id: string; p_guest_key: string | null };
        Returns: void;
      };
      get_author_novel_stats: {
        Args: { p_novel_id: string };
        Returns: {
          reads_7d: number;
          library_7d: number;
          reactions_7d: number;
          comments_7d: number;
          trending_rank: number | null;
          top_rated_rank: number | null;
          most_read_rank: number | null;
          rating_count: number;
          avg_score: number;
          score_histogram: number[];
        }[];
      };
      create_or_get_tag: {
        Args: { p_name: string };
        Returns: {
          id: string;
          name: string;
          slug: string;
          is_approved: boolean;
          was_created: boolean;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
