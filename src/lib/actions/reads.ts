"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureGuestKey } from "@/lib/guestKey";

// Ask the database to record a read. All the deciding — is the chapter
// published? who is the caller? is the caller the novel's own author?
// is this a duplicate for today? — happens inside record_chapter_read()
// (see migration 0005). The browser can't lie about identity because
// the function reads auth.uid() itself.
//
// Fire-and-forget: called from the ChapterReader's effect, but the
// reader never waits for it and a failure never affects the page.
export async function recordChapterRead(_novelId: string, chapterId: string): Promise<void> {
  try {
    const supabase = await createClient();

    // For a signed-in caller the DB function ignores the guest_key
    // argument entirely. Only mint (and pass) one when we know we're
    // guest — otherwise a signed-in reader with no NOVELTREND_GUEST_SECRET
    // set would throw before we ever hit the DB.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let guestKey: string | null = null;
    if (!user) {
      try {
        guestKey = await ensureGuestKey();
      } catch {
        // NOVELTREND_GUEST_SECRET not set: quietly skip recording rather
        // than fall back to a forgeable id. Fire-and-forget already
        // guarantees the page still shows.
        return;
      }
    }

    await supabase.rpc("record_chapter_read", {
      p_chapter_id: chapterId,
      p_guest_key: guestKey,
    });
  } catch {
    // Fire-and-forget: never surface an error to the reader.
  }
}
