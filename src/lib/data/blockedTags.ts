import { createClient } from "@/lib/supabase/server";

// The set of tag ids this reader has blocked, or an empty array for a
// guest. Every list query calls this and passes the result to
// getExcludedNovelIdsFromBlockedTags below.
export async function getBlockedTagIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blocked_tags")
    .select("tag_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.tag_id);
}

// Turn a list of blocked tag ids into the set of novel ids that carry
// any of them. Called before any list query, so we can subtract these
// from the query itself — never in the browser after the fact.
export async function getExcludedNovelIdsFromBlockedTags(blockedTagIds: string[]): Promise<Set<string>> {
  if (blockedTagIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("novel_tags")
    .select("novel_id")
    .in("tag_id", blockedTagIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.novel_id));
}

// Convenience for the common pair of calls above.
export async function loadBlocklist(userId: string | null): Promise<{
  tagIds: string[];
  excludedNovelIds: Set<string>;
}> {
  const tagIds = await getBlockedTagIds(userId);
  const excludedNovelIds = await getExcludedNovelIdsFromBlockedTags(tagIds);
  return { tagIds, excludedNovelIds };
}
