import { createClient } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  pen_name: string | null;
  is_author: boolean;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, pen_name, is_author")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// The current logged-in user (or null for a guest) plus their profile row.
export async function getCurrentUserAndProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const profile = await getProfile(user.id);
  return { user, profile };
}
