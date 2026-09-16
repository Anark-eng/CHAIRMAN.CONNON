"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revealChapterCommentBody, revealParagraphCommentBody } from "@/lib/data/comments";

export interface CommentActionState {
  error?: string;
}

const MAX_COMMENT_LENGTH = 4000;

function validateBody(raw: FormDataEntryValue | null): { ok: true; body: string } | { ok: false; error: string } {
  const body = String(raw ?? "").trim();
  if (!body) return { ok: false, error: "Write something first." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_COMMENT_LENGTH} characters.` };
  }
  return { ok: true, body };
}

// ---- Paragraph comments ----------------------------------------------

export async function addParagraphComment(
  novelId: string,
  chapterId: string,
  paragraphPid: string,
  _prevState: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const validated = validateBody(formData.get("body"));
  if (!validated.ok) return { error: validated.error };

  const isSpoiler = formData.get("is_spoiler") === "on";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to post a comment." };

  const { error } = await supabase.from("paragraph_comments").insert({
    user_id: user.id,
    chapter_id: chapterId,
    paragraph_pid: paragraphPid,
    paragraph_index: 0,
    body: validated.body,
    is_spoiler: isSpoiler,
  });

  if (error) return { error: error.message };

  revalidatePath(`/novels/${novelId}/chapters/${chapterId}/paragraphs/${paragraphPid}`);
  revalidatePath(`/novels/${novelId}/chapters/${chapterId}`);
  return {};
}

export async function deleteParagraphComment(
  novelId: string,
  chapterId: string,
  paragraphPid: string,
  commentId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("paragraph_comments").delete().eq("id", commentId);
  revalidatePath(`/novels/${novelId}/chapters/${chapterId}/paragraphs/${paragraphPid}`);
  revalidatePath(`/novels/${novelId}/chapters/${chapterId}`);
}

export async function revealParagraphComment(commentId: string): Promise<{ body: string | null }> {
  return { body: await revealParagraphCommentBody(commentId) };
}

// ---- Chapter comments -----------------------------------------------

export async function addChapterComment(
  novelId: string,
  chapterId: string,
  _prevState: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const validated = validateBody(formData.get("body"));
  if (!validated.ok) return { error: validated.error };

  const isSpoiler = formData.get("is_spoiler") === "on";
  const parentIdRaw = String(formData.get("parent_id") ?? "").trim();
  const parentId = parentIdRaw || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to post a comment." };

  const { error } = await supabase.from("chapter_comments").insert({
    user_id: user.id,
    chapter_id: chapterId,
    parent_id: parentId,
    body: validated.body,
    is_spoiler: isSpoiler,
  });

  if (error) return { error: error.message };

  revalidatePath(`/novels/${novelId}/chapters/${chapterId}/comments`);
  revalidatePath(`/novels/${novelId}/chapters/${chapterId}`);
  return {};
}

export async function deleteChapterComment(
  novelId: string,
  chapterId: string,
  commentId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("chapter_comments").delete().eq("id", commentId);
  revalidatePath(`/novels/${novelId}/chapters/${chapterId}/comments`);
  revalidatePath(`/novels/${novelId}/chapters/${chapterId}`);
}

export async function revealChapterComment(commentId: string): Promise<{ body: string | null }> {
  return { body: await revealChapterCommentBody(commentId) };
}
