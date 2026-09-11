import { createClient } from "@/lib/supabase/server";
import type { GenreOption, TagOption } from "./types";

export async function getGenres(): Promise<GenreOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("genres").select("id, name, slug").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getTags(): Promise<TagOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tags").select("id, name, slug").order("name");
  if (error) throw error;
  return data ?? [];
}
