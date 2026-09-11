import { createClient } from "@/lib/supabase/server";

export async function getLastReadChapterId(userId: string, novelId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reading_progress")
    .select("chapter_id")
    .eq("user_id", userId)
    .eq("novel_id", novelId)
    .maybeSingle();
  if (error) throw error;
  return data?.chapter_id ?? null;
}
