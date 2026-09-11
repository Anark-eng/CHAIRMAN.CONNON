"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface ChapterActionState {
  error?: string;
}

async function requireNovelOwner(novelId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, owns: false };

  const { data: novel } = await supabase
    .from("novels")
    .select("author_id")
    .eq("id", novelId)
    .maybeSingle();

  return { supabase, user, owns: Boolean(novel && novel.author_id === user.id) };
}

export async function createChapter(
  novelId: string,
  _prevState: ChapterActionState,
  formData: FormData,
): Promise<ChapterActionState> {
  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) return { error: "You need to log in first." };
  if (!owns) return { error: "You can only add chapters to your own novels." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const publish = formData.get("publish") === "on";

  if (!title) return { error: "Give the chapter a title." };
  if (!body.trim()) return { error: "The chapter needs some text." };

  const { count } = await supabase
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("novel_id", novelId);

  const { error } = await supabase.from("chapters").insert({
    novel_id: novelId,
    title,
    body,
    order_number: (count ?? 0) + 1,
    is_published: publish,
    published_at: publish ? new Date().toISOString() : null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/novels/${novelId}`);
  revalidatePath("/my-novels");
  revalidatePath("/");
  redirect(`/novels/${novelId}`);
}

export async function updateChapter(
  novelId: string,
  chapterId: string,
  _prevState: ChapterActionState,
  formData: FormData,
): Promise<ChapterActionState> {
  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) return { error: "You need to log in first." };
  if (!owns) return { error: "You can only edit chapters on your own novels." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const publish = formData.get("publish") === "on";

  if (!title) return { error: "Give the chapter a title." };
  if (!body.trim()) return { error: "The chapter needs some text." };

  const { data: existing } = await supabase
    .from("chapters")
    .select("is_published, published_at")
    .eq("id", chapterId)
    .maybeSingle();

  const publishedAt = publish ? (existing?.published_at ?? new Date().toISOString()) : null;

  const { error } = await supabase
    .from("chapters")
    .update({ title, body, is_published: publish, published_at: publishedAt })
    .eq("id", chapterId)
    .eq("novel_id", novelId);

  if (error) return { error: error.message };

  revalidatePath(`/novels/${novelId}`);
  revalidatePath(`/novels/${novelId}/chapters/${chapterId}`);
  revalidatePath("/");
  redirect(`/novels/${novelId}`);
}

export async function deleteChapter(novelId: string, chapterId: string) {
  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) redirect("/login");
  if (!owns) redirect(`/novels/${novelId}`);

  await supabase.from("chapters").delete().eq("id", chapterId).eq("novel_id", novelId);

  revalidatePath(`/novels/${novelId}`);
  revalidatePath("/my-novels");
  redirect(`/novels/${novelId}`);
}
