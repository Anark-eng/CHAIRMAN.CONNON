"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database, Demographic, NovelStatus } from "@/lib/supabase/database.types";
import { MAX_GENRES_PER_NOVEL } from "@/lib/classification";

export interface NovelActionState {
  error?: string;
}

const STATUSES: NovelStatus[] = ["ongoing", "completed", "hiatus"];
const DEMOGRAPHIC_VALUES: Demographic[] = ["shounen", "shoujo", "seinen", "josei", "general"];

function readIds(formData: FormData, name: string): string[] {
  return Array.from(new Set(formData.getAll(name).map(String).filter(Boolean)));
}

function readDemographic(formData: FormData): Demographic | null {
  const raw = String(formData.get("demographic") ?? "").trim();
  if (!raw) return null;
  return DEMOGRAPHIC_VALUES.includes(raw as Demographic) ? (raw as Demographic) : null;
}

async function requireAuthor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, isAuthor: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_author")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, isAuthor: Boolean(profile?.is_author) };
}

async function uploadCover(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  novelId: string,
  file: File,
): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const extension = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${novelId}/${randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from("covers").upload(path, file, {
    contentType: file.type || undefined,
    upsert: true,
  });

  if (error) {
    throw new Error(`Could not upload cover image: ${error.message}`);
  }

  const { data } = supabase.storage.from("covers").getPublicUrl(path);
  return data.publicUrl;
}

// Replace the novel's genre set. The DB also enforces the 9-cap via a
// trigger; the app-side check gives a friendlier error before the round
// trip.
async function writeNovelGenres(
  supabase: Awaited<ReturnType<typeof createClient>>,
  novelId: string,
  genreIds: string[],
): Promise<{ error?: string }> {
  if (genreIds.length > MAX_GENRES_PER_NOVEL) {
    return { error: `A novel can carry up to ${MAX_GENRES_PER_NOVEL} genres.` };
  }
  await supabase.from("novel_genres").delete().eq("novel_id", novelId);
  if (genreIds.length > 0) {
    const { error } = await supabase
      .from("novel_genres")
      .insert(genreIds.map((genre_id) => ({ novel_id: novelId, genre_id })));
    if (error) return { error: error.message };
  }
  return {};
}

export async function createNovel(
  _prevState: NovelActionState,
  formData: FormData,
): Promise<NovelActionState> {
  const { supabase, user, isAuthor } = await requireAuthor();

  if (!user) return { error: "You need to log in first." };
  if (!isAuthor) return { error: "Turn on Author Mode on your profile first." };

  const title = String(formData.get("title") ?? "").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();
  const status = String(formData.get("status") ?? "ongoing") as NovelStatus;
  const demographic = readDemographic(formData);
  const genreIds = readIds(formData, "genre_ids");
  const tagIds = readIds(formData, "tag_ids");
  const cover = formData.get("cover") as File | null;

  if (!title) return { error: "Give your novel a title." };
  if (!STATUSES.includes(status)) return { error: "Pick a valid status." };
  if (genreIds.length > MAX_GENRES_PER_NOVEL) {
    return { error: `A novel can carry up to ${MAX_GENRES_PER_NOVEL} genres.` };
  }

  const { data: novel, error } = await supabase
    .from("novels")
    .insert({ author_id: user.id, title, synopsis, demographic, status })
    .select("id")
    .single();

  if (error || !novel) {
    return { error: error?.message ?? "Could not create the novel." };
  }

  try {
    if (cover && cover.size > 0) {
      const coverUrl = await uploadCover(supabase, user.id, novel.id, cover);
      if (coverUrl) {
        await supabase.from("novels").update({ cover_url: coverUrl }).eq("id", novel.id);
      }
    }

    const genreResult = await writeNovelGenres(supabase, novel.id, genreIds);
    if (genreResult.error) return { error: genreResult.error };

    if (tagIds.length > 0) {
      await supabase.from("novel_tags").insert(tagIds.map((tag_id) => ({ novel_id: novel.id, tag_id })));
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/my-novels");
  revalidatePath("/");
  redirect(`/novels/${novel.id}`);
}

export async function updateNovel(
  novelId: string,
  _prevState: NovelActionState,
  formData: FormData,
): Promise<NovelActionState> {
  const { supabase, user } = await requireAuthor();
  if (!user) return { error: "You need to log in first." };

  const { data: existing } = await supabase
    .from("novels")
    .select("author_id")
    .eq("id", novelId)
    .maybeSingle();

  if (!existing || existing.author_id !== user.id) {
    return { error: "You can only edit your own novels." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();
  const status = String(formData.get("status") ?? "ongoing") as NovelStatus;
  const demographic = readDemographic(formData);
  const genreIds = readIds(formData, "genre_ids");
  const tagIds = readIds(formData, "tag_ids");
  const cover = formData.get("cover") as File | null;

  if (!title) return { error: "Give your novel a title." };
  if (!STATUSES.includes(status)) return { error: "Pick a valid status." };
  if (genreIds.length > MAX_GENRES_PER_NOVEL) {
    return { error: `A novel can carry up to ${MAX_GENRES_PER_NOVEL} genres.` };
  }

  try {
    const update: Database["public"]["Tables"]["novels"]["Update"] = {
      title,
      synopsis,
      demographic,
      status,
    };

    if (cover && cover.size > 0) {
      const coverUrl = await uploadCover(supabase, user.id, novelId, cover);
      if (coverUrl) update.cover_url = coverUrl;
    }

    const { error } = await supabase.from("novels").update(update).eq("id", novelId);
    if (error) throw new Error(error.message);

    const genreResult = await writeNovelGenres(supabase, novelId, genreIds);
    if (genreResult.error) return { error: genreResult.error };

    await supabase.from("novel_tags").delete().eq("novel_id", novelId);
    if (tagIds.length > 0) {
      await supabase.from("novel_tags").insert(tagIds.map((tag_id) => ({ novel_id: novelId, tag_id })));
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath("/my-novels");
  revalidatePath(`/novels/${novelId}`);
  redirect(`/novels/${novelId}`);
}

export async function deleteNovel(novelId: string) {
  const { supabase, user } = await requireAuthor();
  if (!user) redirect("/login");

  await supabase.from("novels").delete().eq("id", novelId).eq("author_id", user.id);

  revalidatePath("/my-novels");
  revalidatePath("/");
  redirect("/my-novels");
}
