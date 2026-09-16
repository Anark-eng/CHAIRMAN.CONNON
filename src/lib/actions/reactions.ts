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
// Keys on paragraph_pid, the stable identity that survives editing.
export async function toggleParagraphReaction(
  novelId: string,
  chapterId: string,
  paragraphPid: string,
  reactionType: ReactionType,
): Promise<ToggleReactionResult> {
  if (!REACTION_TYPES.includes(reactionType)) return { ok: false };

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
    .eq("paragraph_pid", paragraphPid)
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
      paragraph_pid: paragraphPid,
      // Legacy column, still NOT NULL on the DB from 0003. The
      // reader-side rendering uses pid.
      paragraph_index: 0,
      reaction_type: reactionType,
    });
    if (error) return { ok: false };
    active = true;
  }

  const { data: counts } = await supabase
    .from("paragraph_reaction_counts")
    .select("shocked, heartbreak, laughed, goosebumps, best_line, confused, total")
    .eq("chapter_id", chapterId)
    .eq("paragraph_pid", paragraphPid)
    .maybeSingle();

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
