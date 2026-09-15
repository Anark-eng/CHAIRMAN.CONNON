import type { ReactionType } from "@/lib/supabase/database.types";

// Threshold above which a paragraph earns a left accent bar in the
// reader — "60 or more reactions total".
export const ACCENT_BAR_THRESHOLD = 60;

export const REACTION_LABELS: Record<ReactionType, string> = {
  shocked: "Shocked",
  heartbreak: "Heartbreak",
  laughed: "Laughed",
  goosebumps: "Goosebumps",
  best_line: "Best line",
  confused: "Confused",
};

export const REACTION_EMOJI: Record<ReactionType, string> = {
  shocked: "😱",
  heartbreak: "💔",
  laughed: "😂",
  goosebumps: "🥶",
  best_line: "⭐",
  confused: "🤔",
};

export interface ReactionCountsShape {
  shocked: number;
  heartbreak: number;
  laughed: number;
  goosebumps: number;
  best_line: number;
  confused: number;
  total: number;
}

export const EMPTY_COUNTS: ReactionCountsShape = {
  shocked: 0,
  heartbreak: 0,
  laughed: 0,
  goosebumps: 0,
  best_line: 0,
  confused: 0,
  total: 0,
};
