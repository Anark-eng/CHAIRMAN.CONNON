"use server";

import { createClient } from "@/lib/supabase/server";
import type { TagOption } from "@/lib/data/types";

export interface CreateTagResult {
  ok: boolean;
  tag?: TagOption;
  wasCreated?: boolean; // false when we resolved to an existing tag
  error?: string;
}

// Wraps the create_or_get_tag() SECURITY DEFINER function so the novel
// form can add a tag without a full round-trip through a route handler.
// Every safeguard (empty/punct-only, length, normalised match, shadow
// against genres/demographics) is enforced INSIDE the DB function; this
// action just relays the outcome to the client so the UI can say
// "using existing tag <name> instead of creating a new one".
export async function createTag(name: string): Promise<CreateTagResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a tag name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Log in to create tags." };

  const { data, error } = await supabase.rpc("create_or_get_tag", { p_name: trimmed });
  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { ok: false, error: "Could not create the tag." };

  return {
    ok: true,
    tag: { id: row.id, name: row.name, slug: row.slug, is_approved: row.is_approved },
    wasCreated: row.was_created,
  };
}
