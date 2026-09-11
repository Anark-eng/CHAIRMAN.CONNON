"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveReadingProgress(novelId: string, chapterId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("reading_progress")
    .upsert(
      { user_id: user.id, novel_id: novelId, chapter_id: chapterId, updated_at: new Date().toISOString() },
      { onConflict: "user_id,novel_id" },
    );
}
