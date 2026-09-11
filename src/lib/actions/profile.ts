"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ProfileActionState {
  error?: string;
  message?: string;
}

export async function updateProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to log in first." };
  }

  const authorModeOn = formData.get("is_author") === "on";
  const penName = String(formData.get("pen_name") ?? "").trim();

  if (authorModeOn && penName.length === 0) {
    return { error: "Enter a pen name to turn on Author Mode." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      is_author: authorModeOn,
      pen_name: penName.length > 0 ? penName : null,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { message: "Profile saved." };
}
