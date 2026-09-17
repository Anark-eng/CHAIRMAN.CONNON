import { createClient } from "@/lib/supabase/server";
import type { GenreOption, TagOption } from "./types";
import { tagGroupOf, TAG_GROUPS, type TagGroup } from "@/lib/classification";

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
    .select("id, name, slug, is_approved, tag_group")
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
    .select("tags(id, name, slug, is_approved, tag_group)")
    .eq("novel_id", novelId);

  const used = ((usedRows ?? []) as unknown as { tags: TagOption | null }[])
    .map((r) => r.tags)
    .filter((t): t is TagOption => Boolean(t));

  const merged = new Map<string, TagOption>();
  for (const t of approved) merged.set(t.id, t);
  for (const t of used) merged.set(t.id, t);
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface TagUsage {
  tag: TagOption;
  novelCount: number;
}

export interface GroupedTags {
  // Most-used tags first, capped at `topCount`. The filter sheet
  // opens with this so a reader sees the tags that actually match
  // real novels first, not the alphabetical head of a long list.
  top: TagUsage[];
  // Every approved tag, grouped by tag_group, in the order defined by
  // TAG_GROUPS. Within a group, tags are ordered by usage first
  // (most-used first) then by name — for the same "surface the
  // tags that match novels" reason. Empty groups are omitted.
  groups: Array<{ key: TagGroup; label: string; description?: string; tags: TagUsage[] }>;
}

// Load every approved tag with a rough per-tag novel count. One query
// for the tag list, one for the counts; joined in JS. Rendered by the
// Browse filter sheet.
export async function getGroupedApprovedTags(topCount = 12): Promise<GroupedTags> {
  const supabase = await createClient();
  const [{ data: tagRows, error: tagErr }, { data: linkRows, error: linkErr }] = await Promise.all([
    supabase.from("tags").select("id, name, slug, is_approved, tag_group").eq("is_approved", true),
    supabase.from("novel_tags").select("tag_id, novel_id"),
  ]);
  if (tagErr) throw tagErr;
  if (linkErr) throw linkErr;

  const counts = new Map<string, Set<string>>();
  for (const row of linkRows ?? []) {
    const set = counts.get(row.tag_id) ?? new Set<string>();
    set.add(row.novel_id);
    counts.set(row.tag_id, set);
  }

  const usages: TagUsage[] = (tagRows ?? []).map((tag) => ({
    tag: tag as TagOption,
    novelCount: counts.get(tag.id)?.size ?? 0,
  }));

  const sortByPopThenName = (a: TagUsage, b: TagUsage) =>
    b.novelCount - a.novelCount || a.tag.name.localeCompare(b.tag.name);

  const top = [...usages].sort(sortByPopThenName).slice(0, topCount);

  const groupsMap = new Map<TagGroup, TagUsage[]>();
  for (const u of usages) {
    const key = tagGroupOf(u.tag.tag_group);
    const arr = groupsMap.get(key) ?? [];
    arr.push(u);
    groupsMap.set(key, arr);
  }

  const groups = TAG_GROUPS
    .map(({ value, label, description }) => {
      const list = groupsMap.get(value) ?? [];
      list.sort(sortByPopThenName);
      return { key: value, label, description, tags: list };
    })
    .filter((g) => g.tags.length > 0);

  return { top, groups };
}
