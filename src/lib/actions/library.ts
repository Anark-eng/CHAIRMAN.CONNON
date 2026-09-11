"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addToLibrary(novelId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("library_entries").insert({ user_id: user.id, novel_id: novelId });

  revalidatePath(`/novels/${novelId}`);
  revalidatePath("/library");
}

export async function removeFromLibrary(novelId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("library_entries").delete().eq("user_id", user.id).eq("novel_id", novelId);

  revalidatePath(`/novels/${novelId}`);
  revalidatePath("/library");
}
