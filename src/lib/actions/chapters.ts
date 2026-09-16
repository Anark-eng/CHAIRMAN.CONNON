"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  EMPTY_PARAGRAPHS,
  assignPids,
  droppedPids,
  parseMarkdownParagraphs,
  paragraphsToBody,
  type Paragraph,
} from "@/lib/chapterContent";

type ChapterUpdate = Database["public"]["Tables"]["chapters"]["Update"];

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

interface EditorPayload {
  title: string;
  markdown: string;
  authorNoteTop: string | null;
  authorNoteBottom: string | null;
  volumeId: string | null;
  publishAt: string | null; // ISO or null; when publishAt is future the chapter stays unpublished
  publish: boolean; // publish now
  scheduleOnly: boolean; // save as scheduled (publishAt required)
  confirmDropParagraphPids: string[]; // pids the client acknowledged losing
}

function readPayload(formData: FormData): EditorPayload {
  const publishAtRaw = String(formData.get("publish_at") ?? "").trim();
  return {
    title: String(formData.get("title") ?? "").trim(),
    markdown: String(formData.get("markdown") ?? ""),
    authorNoteTop: nullIfEmpty(formData.get("author_note_top")),
    authorNoteBottom: nullIfEmpty(formData.get("author_note_bottom")),
    volumeId: nullIfEmpty(formData.get("volume_id")),
    publishAt: publishAtRaw || null,
    publish: formData.get("publish") === "on",
    scheduleOnly: formData.get("schedule_only") === "on",
    confirmDropParagraphPids: formData.getAll("confirm_drop_pids").map(String).filter(Boolean),
  };
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

// Look up the chapter's current paragraphs so we can reuse pids by
// text-match. Returns [] if the chapter is new or currently empty.
async function readCurrentParagraphs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chapterId: string,
): Promise<Paragraph[]> {
  const { data } = await supabase
    .from("chapters")
    .select("paragraphs")
    .eq("id", chapterId)
    .maybeSingle();
  const raw = (data?.paragraphs ?? []) as unknown;
  return Array.isArray(raw) ? (raw as Paragraph[]) : EMPTY_PARAGRAPHS;
}

// If the author's incoming markdown DROPS a paragraph that has stored
// reactions or comments, refuse the save unless the client passed the
// same set of pids back in confirm_drop_pids. This is the "tell the
// author before saving that discussion will be removed" gate.
async function checkDroppedDiscussions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chapterId: string,
  dropped: string[],
  confirmed: string[],
): Promise<{ blockPids: string[] } | null> {
  if (dropped.length === 0) return null;
  const confirmedSet = new Set(confirmed);
  const unconfirmed = dropped.filter((pid) => !confirmedSet.has(pid));
  if (unconfirmed.length === 0) return null;

  const [{ data: reactionRows }, { data: commentRows }] = await Promise.all([
    supabase
      .from("paragraph_reactions")
      .select("paragraph_pid")
      .eq("chapter_id", chapterId)
      .in("paragraph_pid", unconfirmed),
    supabase
      .from("paragraph_comments")
      .select("paragraph_pid")
      .eq("chapter_id", chapterId)
      .in("paragraph_pid", unconfirmed),
  ]);
  const hasDiscussion = new Set<string>();
  for (const r of reactionRows ?? []) hasDiscussion.add(r.paragraph_pid);
  for (const r of commentRows ?? []) hasDiscussion.add(r.paragraph_pid);
  const block = [...hasDiscussion];
  return block.length > 0 ? { blockPids: block } : null;
}

interface SaveOptions {
  novelId: string;
  chapterId: string;
  payload: EditorPayload;
}

// Shared save path. Applies to autosave, manual save, publish, and
// schedule — they only differ in what they do with is_published and
// publish_at at the end.
async function persistChapter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: SaveOptions,
): Promise<{ error?: string; savedAt: string; paragraphs: Paragraph[]; blockedDropPids?: string[] }> {
  const { novelId, chapterId, payload } = opts;

  if (!payload.title) return { error: "Give the chapter a title.", savedAt: "", paragraphs: [] };

  const existing = await readCurrentParagraphs(supabase, chapterId);
  const parsed = parseMarkdownParagraphs(payload.markdown);
  const nextParagraphs = assignPids(parsed, existing);
  if (nextParagraphs.length === 0) {
    return { error: "The chapter needs some text.", savedAt: "", paragraphs: [] };
  }

  const dropped = droppedPids(existing, nextParagraphs);
  const drop = await checkDroppedDiscussions(supabase, chapterId, dropped, payload.confirmDropParagraphPids);
  if (drop) {
    return {
      error:
        "Some paragraphs about to be removed have reactions or comments. Confirm below to remove them.",
      savedAt: "",
      paragraphs: [],
      blockedDropPids: drop.blockPids,
    };
  }

  // Server-side publish decision. Autosave never publishes. A manual
  // Publish flips is_published + published_at now and clears publish_at.
  // A Schedule sets publish_at future + keeps is_published false; the
  // pg_cron job flips it at the moment.
  const nowIso = new Date().toISOString();
  const update: ChapterUpdate = {
    title: payload.title,
    body: paragraphsToBody(nextParagraphs),
    paragraphs: nextParagraphs,
    author_note_top: payload.authorNoteTop,
    author_note_bottom: payload.authorNoteBottom,
    volume_id: payload.volumeId,
  };

  if (payload.publish) {
    update.is_published = true;
    update.published_at = nowIso;
    update.publish_at = null;
  } else if (payload.scheduleOnly && payload.publishAt) {
    const when = new Date(payload.publishAt);
    if (Number.isNaN(when.getTime())) {
      return { error: "That publish time isn't a valid date.", savedAt: "", paragraphs: [] };
    }
    if (when.getTime() <= Date.now()) {
      return { error: "Pick a publish time in the future.", savedAt: "", paragraphs: [] };
    }
    update.is_published = false;
    update.published_at = null;
    update.publish_at = when.toISOString();
  }
  // Otherwise (autosave / plain save): don't touch is_published or publish_at.

  const { error } = await supabase.from("chapters").update(update).eq("id", chapterId).eq("novel_id", novelId);
  if (error) return { error: error.message, savedAt: "", paragraphs: [] };

  // Drop the corresponding reaction and comment rows for pids that are
  // gone. RLS on paragraph_reactions/comments blocks a random caller
  // from doing this; the author of this novel is allowed to delete
  // paragraph_comments and the trigger will clean up counts on delete.
  if (dropped.length > 0) {
    await supabase.from("paragraph_reactions").delete().eq("chapter_id", chapterId).in("paragraph_pid", dropped);
    await supabase.from("paragraph_comments").delete().eq("chapter_id", chapterId).in("paragraph_pid", dropped);
    await supabase.from("paragraph_reaction_counts").delete().eq("chapter_id", chapterId).in("paragraph_pid", dropped);
  }

  revalidatePath(`/novels/${novelId}/chapters/${chapterId}`);
  revalidatePath(`/novels/${novelId}`);
  revalidatePath("/my-novels");
  return { savedAt: nowIso, paragraphs: nextParagraphs };
}

// ---------------------------------------------------------------------------
// createChapter — used only for the "new chapter" flow. Creates an empty
// draft row so the editor has a chapter id to autosave into, then opens
// the editor for that id.
// ---------------------------------------------------------------------------
export async function createChapterAndOpen(novelId: string): Promise<void> {
  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) redirect("/login");
  if (!owns) redirect(`/novels/${novelId}`);

  const { count } = await supabase
    .from("chapters")
    .select("id", { count: "exact", head: true })
    .eq("novel_id", novelId);

  const { data: chapter, error } = await supabase
    .from("chapters")
    .insert({
      novel_id: novelId,
      title: "Untitled chapter",
      body: "",
      paragraphs: [],
      order_number: (count ?? 0) + 1,
      is_published: false,
    })
    .select("id")
    .single();

  if (error || !chapter) redirect(`/novels/${novelId}`);
  redirect(`/novels/${novelId}/chapters/${chapter!.id}/edit`);
}

// ---------------------------------------------------------------------------
// Autosave — the fire-and-forget path called from the editor after a
// short debounce. Returns the fresh saved-at timestamp for the "last
// saved …" line. Never publishes.
// ---------------------------------------------------------------------------
export interface AutosaveResult {
  ok: boolean;
  savedAt?: string;
  error?: string;
  blockedDropPids?: string[];
}

export async function autosaveChapter(
  novelId: string,
  chapterId: string,
  formData: FormData,
): Promise<AutosaveResult> {
  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) return { ok: false, error: "Not logged in." };
  if (!owns) return { ok: false, error: "Not your chapter." };
  const payload = readPayload(formData);
  const result = await persistChapter(supabase, { novelId, chapterId, payload });
  if (result.error) return { ok: false, error: result.error, blockedDropPids: result.blockedDropPids };
  return { ok: true, savedAt: result.savedAt };
}

// ---------------------------------------------------------------------------
// Manual save (server action form). Handles Save Draft / Publish /
// Schedule from the editor's submit buttons. Redirects the author to
// the novel page on success.
// ---------------------------------------------------------------------------
export async function saveChapter(
  novelId: string,
  chapterId: string,
  _prev: ChapterActionState,
  formData: FormData,
): Promise<ChapterActionState> {
  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) return { error: "You need to log in first." };
  if (!owns) return { error: "You can only edit your own novels." };

  const payload = readPayload(formData);
  const result = await persistChapter(supabase, { novelId, chapterId, payload });
  if (result.error) return { error: result.error };

  redirect(`/novels/${novelId}`);
}

// ---------------------------------------------------------------------------
// Cancel a scheduled publish. Clears publish_at; the chapter stays a
// draft.
// ---------------------------------------------------------------------------
export async function cancelSchedule(novelId: string, chapterId: string): Promise<void> {
  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) redirect("/login");
  if (!owns) return;
  await supabase.from("chapters").update({ publish_at: null }).eq("id", chapterId).eq("novel_id", novelId);
  revalidatePath(`/novels/${novelId}`);
}

// ---------------------------------------------------------------------------
// Reordering. `newOrder` is an ordered list of chapter ids. Applies
// order_number = 1..N in the given order. Does NOT change which
// chapter a reader has read up to — reading progress is keyed on
// chapter_id, not on the number.
// ---------------------------------------------------------------------------
export async function reorderChapters(novelId: string, newOrder: string[]): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) return { ok: false, error: "Not logged in." };
  if (!owns) return { ok: false, error: "Not your novel." };

  // Two-phase to sidestep the unique(novel_id, order_number) collision:
  // shift everything to negative order first, then set the target.
  const { data: existing } = await supabase.from("chapters").select("id").eq("novel_id", novelId);
  const knownIds = new Set((existing ?? []).map((c) => c.id));
  for (const id of newOrder) if (!knownIds.has(id)) return { ok: false, error: "One of those chapters isn't on this novel." };

  for (let i = 0; i < newOrder.length; i++) {
    const err = await supabase
      .from("chapters")
      .update({ order_number: -(i + 1) })
      .eq("id", newOrder[i])
      .eq("novel_id", novelId);
    if (err.error) return { ok: false, error: err.error.message };
  }
  for (let i = 0; i < newOrder.length; i++) {
    const err = await supabase
      .from("chapters")
      .update({ order_number: i + 1 })
      .eq("id", newOrder[i])
      .eq("novel_id", novelId);
    if (err.error) return { ok: false, error: err.error.message };
  }

  revalidatePath(`/novels/${novelId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Volumes.
// ---------------------------------------------------------------------------
export async function createVolume(novelId: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Volume name is required." };

  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) return { ok: false, error: "Not logged in." };
  if (!owns) return { ok: false, error: "Not your novel." };

  const { count } = await supabase
    .from("volumes")
    .select("id", { count: "exact", head: true })
    .eq("novel_id", novelId);

  const { error } = await supabase
    .from("volumes")
    .insert({ novel_id: novelId, name: trimmed, position: (count ?? 0) + 1 });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/novels/${novelId}`);
  return { ok: true };
}

export async function moveChapterToVolume(
  novelId: string,
  chapterId: string,
  volumeId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, owns } = await requireNovelOwner(novelId);
  if (!user) return { ok: false, error: "Not logged in." };
  if (!owns) return { ok: false, error: "Not your novel." };

  const { error } = await supabase
    .from("chapters")
    .update({ volume_id: volumeId })
    .eq("id", chapterId)
    .eq("novel_id", novelId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/novels/${novelId}`);
  return { ok: true };
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
