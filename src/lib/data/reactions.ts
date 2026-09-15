import { createClient } from "@/lib/supabase/server";
import type { ReactionType } from "@/lib/supabase/database.types";

export interface ParagraphReactionCounts {
  paragraph_index: number;
  shocked: number;
  heartbreak: number;
  laughed: number;
  goosebumps: number;
  best_line: number;
  confused: number;
  total: number;
}

// One row per paragraph that has any reactions on it. Absent paragraphs
// have an implicit zero count on every reaction type.
export async function getReactionCountsForChapter(
  chapterId: string,
): Promise<ParagraphReactionCounts[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paragraph_reaction_counts")
    .select("paragraph_index, shocked, heartbreak, laughed, goosebumps, best_line, confused, total")
    .eq("chapter_id", chapterId);

  if (error) throw error;
  return data ?? [];
}

// A reader's own reactions on this chapter, so the reader can see which
// reactions they've already picked without a per-paragraph round-trip.
export async function getMyReactionsForChapter(
  userId: string,
  chapterId: string,
): Promise<Array<{ paragraph_index: number; reaction_type: ReactionType }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paragraph_reactions")
    .select("paragraph_index, reaction_type")
    .eq("user_id", userId)
    .eq("chapter_id", chapterId);

  if (error) throw error;
  return data ?? [];
}
