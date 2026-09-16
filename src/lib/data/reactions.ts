import { createClient } from "@/lib/supabase/server";
import type { ReactionType } from "@/lib/supabase/database.types";

export interface ParagraphReactionCounts {
  paragraph_pid: string;
  shocked: number;
  heartbreak: number;
  laughed: number;
  goosebumps: number;
  best_line: number;
  confused: number;
  total: number;
}

export async function getReactionCountsForChapter(chapterId: string): Promise<ParagraphReactionCounts[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paragraph_reaction_counts")
    .select("paragraph_pid, shocked, heartbreak, laughed, goosebumps, best_line, confused, total")
    .eq("chapter_id", chapterId);

  if (error) throw error;
  return data ?? [];
}

export async function getMyReactionsForChapter(
  userId: string,
  chapterId: string,
): Promise<Array<{ paragraph_pid: string; reaction_type: ReactionType }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paragraph_reactions")
    .select("paragraph_pid, reaction_type")
    .eq("user_id", userId)
    .eq("chapter_id", chapterId);

  if (error) throw error;
  return data ?? [];
}
