import { createClient } from "@/lib/supabase/server";
import type { GenreOption, TagOption } from "./types";

export async function getGenres(): Promise<GenreOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("genres").select("id, name, slug").order("name");
  if (error) throw error;
  return data ?? [];
}

// Reader-facing tag list — only APPROVED tags appear in Browse's filter
// bar and the profile's blocked-tags picker. Unapproved (author-created,
// not yet adopted by TAG_APPROVAL_MIN_NOVELS distinct novels) tags are
// still displayed on the novel that carries them; they just don't
// spread into filter surfaces until they earn their place.
export async function getApprovedTags(): Promise<TagOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, slug, is_approved")
    .eq("is_approved", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

// Kept for backwards compatibility with existing call sites that
// haven't been renamed. Same shape as getApprovedTags.
export const getTags = getApprovedTags;

// Author-facing tag list for the novel form: every approved tag plus
// any UNAPPROVED tags the author's own novel already carries, so a
// tag they created earlier still appears among their selections.
export async function getTagsForAuthorForm(novelId: string | null): Promise<TagOption[]> {
  const supabase = await createClient();
  const approved = await getApprovedTags();
  if (!novelId) return approved;

  const { data: usedRows } = await supabase
    .from("novel_tags")
    .select("tags(id, name, slug, is_approved)")
    .eq("novel_id", novelId);

  const used = ((usedRows ?? []) as unknown as { tags: TagOption | null }[])
    .map((r) => r.tags)
    .filter((t): t is TagOption => Boolean(t));

  const merged = new Map<string, TagOption>();
  for (const t of approved) merged.set(t.id, t);
  for (const t of used) merged.set(t.id, t);
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
