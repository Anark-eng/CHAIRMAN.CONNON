import { createClient } from "@/lib/supabase/server";

// A comment on a paragraph or a chapter. `body` is null when the comment
// is flagged as a spoiler AND the viewer hasn't chosen to reveal it — the
// SQL query never selects the body column in that case, so the text
// physically doesn't reach the browser until the reader taps reveal (see
// revealChapterComment / revealParagraphComment server actions).
export interface CommentView {
  id: string;
  author_id: string;
  author_pen_name: string | null;
  body: string | null;
  is_spoiler: boolean;
  created_at: string;
}

export interface ThreadedChapterComment extends CommentView {
  replies: CommentView[];
}

type ParagraphCommentRow = {
  id: string;
  user_id: string;
  is_spoiler: boolean;
  created_at: string;
  body?: string | null;
  profiles: { pen_name: string | null } | null;
};

type ChapterCommentRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  is_spoiler: boolean;
  created_at: string;
  body?: string | null;
  profiles: { pen_name: string | null } | null;
};

function toParagraphView(row: ParagraphCommentRow): CommentView {
  return {
    id: row.id,
    author_id: row.user_id,
    author_pen_name: row.profiles?.pen_name ?? null,
    is_spoiler: row.is_spoiler,
    created_at: row.created_at,
    body: row.is_spoiler ? null : row.body ?? "",
  };
}

function toChapterView(row: ChapterCommentRow): CommentView {
  return {
    id: row.id,
    author_id: row.user_id,
    author_pen_name: row.profiles?.pen_name ?? null,
    is_spoiler: row.is_spoiler,
    created_at: row.created_at,
    body: row.is_spoiler ? null : row.body ?? "",
  };
}

// Two-pass fetch, so spoiler rows' body text never leaves the database.
// Pass 1 selects id/spoiler/author for every row. Pass 2 selects body for
// only the non-spoiler rows.
async function fetchWithBodies<T extends { id: string; is_spoiler: boolean }>(
  rowsWithoutBody: T[],
  loadBodies: (ids: string[]) => Promise<Map<string, string>>,
): Promise<Array<T & { body: string | null }>> {
  const visibleIds = rowsWithoutBody.filter((r) => !r.is_spoiler).map((r) => r.id);
  const bodies = visibleIds.length > 0 ? await loadBodies(visibleIds) : new Map<string, string>();

  return rowsWithoutBody.map((row) => ({
    ...row,
    body: row.is_spoiler ? null : bodies.get(row.id) ?? "",
  }));
}

// ---- Paragraph comments ----------------------------------------------

export async function getParagraphComments(
  chapterId: string,
  paragraphPid: string,
): Promise<CommentView[]> {
  const supabase = await createClient();

  const { data: skeletons, error: skeletonError } = await supabase
    .from("paragraph_comments")
    .select("id, user_id, is_spoiler, created_at, profiles(pen_name)")
    .eq("chapter_id", chapterId)
    .eq("paragraph_pid", paragraphPid)
    .order("created_at", { ascending: false });

  if (skeletonError) throw skeletonError;
  if (!skeletons || skeletons.length === 0) return [];

  const withBodies = await fetchWithBodies(
    skeletons as unknown as ParagraphCommentRow[],
    async (ids) => {
      const { data: rows, error } = await supabase
        .from("paragraph_comments")
        .select("id, body")
        .in("id", ids);
      if (error) throw error;
      return new Map((rows ?? []).map((r) => [r.id, r.body]));
    },
  );

  return withBodies.map(toParagraphView);
}

// Keyed on paragraph_pid so reader-side per-paragraph badges follow
// each paragraph through edits.
export async function getParagraphCommentCounts(
  chapterId: string,
  paragraphPids: string[],
): Promise<Map<string, number>> {
  if (paragraphPids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paragraph_comments")
    .select("paragraph_pid")
    .eq("chapter_id", chapterId)
    .in("paragraph_pid", paragraphPids);

  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.paragraph_pid, (counts.get(row.paragraph_pid) ?? 0) + 1);
  }
  return counts;
}

// Look up a single paragraph comment's body — used by the "reveal spoiler"
// action. Returns null if the row is gone or the viewer can't see it.
export async function revealParagraphCommentBody(commentId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paragraph_comments")
    .select("body")
    .eq("id", commentId)
    .maybeSingle();
  if (error || !data) return null;
  return data.body;
}

// ---- Chapter comments -----------------------------------------------

export async function getChapterCommentsThreaded(chapterId: string): Promise<ThreadedChapterComment[]> {
  const supabase = await createClient();

  const { data: skeletons, error: skeletonError } = await supabase
    .from("chapter_comments")
    .select("id, user_id, parent_id, is_spoiler, created_at, profiles(pen_name)")
    .eq("chapter_id", chapterId)
    .order("created_at", { ascending: false });

  if (skeletonError) throw skeletonError;
  if (!skeletons || skeletons.length === 0) return [];

  const withBodies = await fetchWithBodies(
    skeletons as unknown as ChapterCommentRow[],
    async (ids) => {
      const { data: rows, error } = await supabase
        .from("chapter_comments")
        .select("id, body")
        .in("id", ids);
      if (error) throw error;
      return new Map((rows ?? []).map((r) => [r.id, r.body]));
    },
  );

  const views = withBodies.map(toChapterView);
  const rowsById = new Map(withBodies.map((r) => [r.id, r]));

  const roots: ThreadedChapterComment[] = [];
  const rootsById = new Map<string, ThreadedChapterComment>();

  // First pass: create root threads (newest first).
  for (const view of views) {
    const row = rowsById.get(view.id)!;
    if (row.parent_id === null) {
      const thread: ThreadedChapterComment = { ...view, replies: [] };
      roots.push(thread);
      rootsById.set(view.id, thread);
    }
  }

  // Second pass: attach replies in ascending order (oldest first inside a
  // thread — replies read as a conversation).
  const replies = views
    .filter((v) => rowsById.get(v.id)!.parent_id !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const reply of replies) {
    const row = rowsById.get(reply.id)!;
    const parent = rootsById.get(row.parent_id!);
    if (parent) parent.replies.push(reply);
  }

  return roots;
}

export async function revealChapterCommentBody(commentId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chapter_comments")
    .select("body")
    .eq("id", commentId)
    .maybeSingle();
  if (error || !data) return null;
  return data.body;
}

export async function getChapterCommentCount(chapterId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("chapter_comments")
    .select("id", { count: "exact", head: true })
    .eq("chapter_id", chapterId);
  if (error) throw error;
  return count ?? 0;
}
