import { createClient } from "@/lib/supabase/server";

// Fixed UUID of the reserved "Deleted user" profile. Mirrored in
// migration 0010; if you change one, change both. Used to detect the
// reserved account (never show a settings link to it, never attribute
// a novel back to a deleted human).
export const RESERVED_DELETED_USER_ID = "00000000-0000-0000-0000-000000000001";

export interface ProfileLink {
  label?: string | null;
  url: string;
}

export interface Profile {
  id: string;
  pen_name: string | null;
  is_author: boolean;
  avatar_url: string | null;
  bio: string | null;
  links: ProfileLink[];
  deleted_at: string | null;
  deletion_choice: "keep_work" | "remove_work" | null;
}

const PROFILE_COLUMNS =
  "id, pen_name, is_author, avatar_url, bio, links, deleted_at, deletion_choice";

function toProfile(row: {
  id: string;
  pen_name: string | null;
  is_author: boolean;
  avatar_url: string | null;
  bio: string | null;
  links: unknown;
  deleted_at: string | null;
  deletion_choice: string | null;
}): Profile {
  return {
    id: row.id,
    pen_name: row.pen_name,
    is_author: row.is_author,
    avatar_url: row.avatar_url,
    bio: row.bio,
    links: Array.isArray(row.links) ? (row.links as ProfileLink[]) : [],
    deleted_at: row.deleted_at,
    deletion_choice:
      row.deletion_choice === "keep_work" || row.deletion_choice === "remove_work"
        ? row.deletion_choice
        : null,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
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
