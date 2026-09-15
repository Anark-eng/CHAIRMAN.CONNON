"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureGuestKey } from "@/lib/guestKey";

// Record that a reader read this chapter. Called fire-and-forget from
// the reader page (see ChapterReader's effect). Never blocks or throws:
// if anything goes wrong, the chapter still shows. The DB has a
// (chapter, reader, day) unique index, so repeat calls on the same day
// are a no-op.
//
// Skips:
//   - the novel's own author reading their own novel (would inflate
//     trending in the author's favour).
//   - draft chapters (nothing to trend on).
export async function recordChapterRead(novelId: string, chapterId: string): Promise<void> {
  try {
    const supabase = await createClient();

    // Confirm the chapter is published and grab its author id in one round.
    const { data: chapterData } = await supabase
      .from("chapters")
      .select("id, is_published, novels!inner(author_id)")
      .eq("id", chapterId)
      .maybeSingle();

    const chapter = chapterData as unknown as
      | { id: string; is_published: boolean; novels: { author_id: string } }
      | null;

    if (!chapter || !chapter.is_published) return;
    const authorId = chapter.novels.author_id;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Don't count an author's read of their own novel.
      if (user.id === authorId) return;

      await supabase
        .from("chapter_reads")
        .insert({ chapter_id: chapterId, novel_id: novelId, user_id: user.id })
        // Duplicate-key errors are the point of the per-day unique index --
        // swallow them silently by ignoring the returned error below.
        .select()
        .maybeSingle();
      return;
    }

    // Guest: mint or reuse a cookie id.
    const guestKey = await ensureGuestKey();
    await supabase
      .from("chapter_reads")
      .insert({ chapter_id: chapterId, novel_id: novelId, guest_key: guestKey })
      .select()
      .maybeSingle();
  } catch {
    // Fire-and-forget: never surface an error to the reader.
  }
}
