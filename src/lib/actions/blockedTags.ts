"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Toggle a tag on or off the reader's block list. Guests can't block --
// nothing calls this without a session anyway. RLS refuses non-self
// writes as the ultimate gate.
export async function toggleBlockedTag(tagId: string, block: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (block) {
    await supabase.from("blocked_tags").insert({ user_id: user.id, tag_id: tagId });
  } else {
    await supabase.from("blocked_tags").delete().eq("user_id", user.id).eq("tag_id", tagId);
  }

  // Every list is filtered by this — revalidate the layout so the next
  // navigation reflects the change.
  revalidatePath("/", "layout");
}
