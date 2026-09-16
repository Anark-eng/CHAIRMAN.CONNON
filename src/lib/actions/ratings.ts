"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normaliseRating } from "@/lib/rankings";

export interface RatingActionResult {
  ok: boolean;
  needsLogin?: boolean;
  ownNovel?: boolean;
  error?: string;
  summary?: { ratingCount: number; avgScore: number };
  myRating?: number | null;
}

async function readFreshSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  novelId: string,
): Promise<{ ratingCount: number; avgScore: number }> {
  const { data } = await supabase
    .from("novel_rating_stats")
    .select("rating_count, avg_score")
    .eq("novel_id", novelId)
    .maybeSingle();
  return {
    ratingCount: data?.rating_count ?? 0,
    avgScore: Number(data?.avg_score ?? 0),
  };
}

// Set (or change) the reader's rating for a novel. The DB trigger
// updates the running stats automatically, so we just read them back.
export async function rateNovel(novelId: string, rawScore: number): Promise<RatingActionResult> {
  const score = normaliseRating(rawScore);
  if (score === null) return { ok: false, error: "Pick a rating between 0.5 and 10." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, needsLogin: true };

  // Cheap pre-check so the UI can say "you can't rate your own novel"
  // instead of blowing up on the trigger. RLS + the trigger are the
  // real gate, in that order.
  const { data: novel } = await supabase.from("novels").select("author_id").eq("id", novelId).maybeSingle();
  if (!novel) return { ok: false, error: "Novel not found." };
  if (novel.author_id === user.id) return { ok: false, ownNovel: true };

  const { error } = await supabase
    .from("novel_ratings")
    .upsert(
      { user_id: user.id, novel_id: novelId, score },
      { onConflict: "user_id,novel_id" },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/novels/${novelId}`);
  revalidatePath("/rankings");

  return {
    ok: true,
    myRating: score,
    summary: await readFreshSummary(supabase, novelId),
  };
}

export async function removeMyRating(novelId: string): Promise<RatingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, needsLogin: true };

  const { error } = await supabase
    .from("novel_ratings")
    .delete()
    .eq("user_id", user.id)
    .eq("novel_id", novelId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/novels/${novelId}`);
  revalidatePath("/rankings");

  return {
    ok: true,
    myRating: null,
    summary: await readFreshSummary(supabase, novelId),
  };
}
