import { notFound, redirect } from "next/navigation";
import { ChapterEditor } from "@/components/ChapterEditor";
import { DeleteChapterButton } from "@/components/DeleteChapterButton";
import { createClient } from "@/lib/supabase/server";
import {
  paragraphsToMarkdown,
  type Paragraph,
} from "@/lib/chapterContent";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getChapter, getNovelById } from "@/lib/data/novels";

export default async function EditChapterPage({
  params,
}: {
  params: Promise<{ novelId: string; chapterId: string }>;
}) {
  const { novelId, chapterId } = await params;
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");

  const [novel, chapter] = await Promise.all([getNovelById(novelId), getChapter(novelId, chapterId)]);
  if (!novel || !chapter) notFound();
  if (novel.author_id !== user.id) redirect(`/novels/${novelId}`);

  const paragraphs = (Array.isArray(chapter.paragraphs) ? chapter.paragraphs : []) as Paragraph[];
  const initialMarkdown = paragraphs.length > 0
    ? paragraphsToMarkdown(paragraphs)
    : chapter.body ?? "";

  // Load this novel's volumes for the "which volume" picker.
  const supabase = await createClient();
  const { data: volumeRows } = await supabase
    .from("volumes")
    .select("id, name, position")
    .eq("novel_id", novelId)
    .order("position", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="mb-1 text-sm text-[var(--muted)]">{novel.title}</p>
      <h1 className="mb-6 text-2xl font-semibold">Edit chapter</h1>

      <ChapterEditor
        novelId={novelId}
        chapterId={chapterId}
        initial={{
          title: chapter.title,
          markdown: initialMarkdown,
          authorNoteTop: chapter.author_note_top ?? "",
          authorNoteBottom: chapter.author_note_bottom ?? "",
          volumeId: chapter.volume_id,
          publishAt: chapter.publish_at,
          isPublished: chapter.is_published,
        }}
        volumes={(volumeRows ?? []).map((v) => ({ id: v.id, name: v.name }))}
      />

      <div className="mt-8 border-t border-[var(--border)] pt-6">
        <DeleteChapterButton novelId={novelId} chapterId={chapterId} />
      </div>
    </div>
  );
}
