"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REACTION_TYPES, type ReactionType } from "@/lib/supabase/database.types";

export interface ToggleReactionResult {
  ok: boolean;
  needsLogin?: boolean;
  active?: boolean;
  counts?: {
    shocked: number;
    heartbreak: number;
    laughed: number;
    goosebumps: number;
    best_line: number;
    confused: number;
    total: number;
  };
}

// Toggle a single (paragraph, reaction_type) for the current reader.
// Returns whether the reaction is now active + the fresh per-paragraph
// counts, so the UI can update without a full page reload. Guests are
// told the UI should push them to log in — we never write for them.
export async function toggleParagraphReaction(
  novelId: string,
  chapterId: string,
  paragraphIndex: number,
  reactionType: ReactionType,
): Promise<ToggleReactionResult> {
  if (!REACTION_TYPES.includes(reactionType)) {
    return { ok: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, needsLogin: true };

  const { data: existing } = await supabase
    .from("paragraph_reactions")
    .select("id")
    .eq("user_id", user.id)
    .eq("chapter_id", chapterId)
    .eq("paragraph_index", paragraphIndex)
    .eq("reaction_type", reactionType)
    .maybeSingle();

  let active: boolean;
  if (existing) {
    const { error } = await supabase.from("paragraph_reactions").delete().eq("id", existing.id);
    if (error) return { ok: false };
    active = false;
  } else {
    const { error } = await supabase.from("paragraph_reactions").insert({
      user_id: user.id,
      chapter_id: chapterId,
      paragraph_index: paragraphIndex,
      reaction_type: reactionType,
    });
    if (error) return { ok: false };
    active = true;
  }

  // The DB trigger has already updated the counts row. Read it back for
  // the client. RLS on paragraph_reaction_counts lets the reader see
  // published-chapter counts.
  const { data: counts } = await supabase
    .from("paragraph_reaction_counts")
    .select("shocked, heartbreak, laughed, goosebumps, best_line, confused, total")
    .eq("chapter_id", chapterId)
    .eq("paragraph_index", paragraphIndex)
    .maybeSingle();

  // Bust the reader page's cache so a full navigation reflects the change.
  revalidatePath(`/novels/${novelId}/chapters/${chapterId}`);

  return {
    ok: true,
    active,
    counts: counts ?? {
      shocked: 0,
      heartbreak: 0,
      laughed: 0,
      goosebumps: 0,
      best_line: 0,
      confused: 0,
      total: 0,
    },
  };
}
