"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database, NovelStatus } from "@/lib/supabase/database.types";

export interface NovelActionState {
  error?: string;
}

const STATUSES: NovelStatus[] = ["ongoing", "completed", "hiatus"];

function readTagIds(formData: FormData): string[] {
  return formData.getAll("tag_ids").map(String).filter(Boolean);
}

async function requireAuthor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, isAuthor: false };
  }

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

export async function createNovel(
  _prevState: NovelActionState,
  formData: FormData,
): Promise<NovelActionState> {
  const { supabase, user, isAuthor } = await requireAuthor();

  if (!user) return { error: "You need to log in first." };
  if (!isAuthor) return { error: "Turn on Author Mode on your profile first." };

  const title = String(formData.get("title") ?? "").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();
  const genreId = String(formData.get("genre_id") ?? "").trim();
  const status = String(formData.get("status") ?? "ongoing") as NovelStatus;
  const cover = formData.get("cover") as File | null;

  if (!title) return { error: "Give your novel a title." };
  if (!STATUSES.includes(status)) return { error: "Pick a valid status." };

  const { data: novel, error } = await supabase
    .from("novels")
    .insert({
      author_id: user.id,
      title,
      synopsis,
      genre_id: genreId || null,
      status,
    })
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

    const tagIds = readTagIds(formData);
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
  const genreId = String(formData.get("genre_id") ?? "").trim();
  const status = String(formData.get("status") ?? "ongoing") as NovelStatus;
  const cover = formData.get("cover") as File | null;

  if (!title) return { error: "Give your novel a title." };
  if (!STATUSES.includes(status)) return { error: "Pick a valid status." };

  try {
    const update: Database["public"]["Tables"]["novels"]["Update"] = {
      title,
      synopsis,
      genre_id: genreId || null,
      status,
    };

    if (cover && cover.size > 0) {
      const coverUrl = await uploadCover(supabase, user.id, novelId, cover);
      if (coverUrl) update.cover_url = coverUrl;
    }

    const { error } = await supabase.from("novels").update(update).eq("id", novelId);
    if (error) throw new Error(error.message);

    await supabase.from("novel_tags").delete().eq("novel_id", novelId);
    const tagIds = readTagIds(formData);
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
