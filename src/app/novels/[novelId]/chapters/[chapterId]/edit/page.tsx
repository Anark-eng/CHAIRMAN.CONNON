import { notFound, redirect } from "next/navigation";
import { ChapterForm } from "@/components/ChapterForm";
import { DeleteChapterButton } from "@/components/DeleteChapterButton";
import { updateChapter } from "@/lib/actions/chapters";
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Edit chapter</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">{novel.title}</p>
      <ChapterForm
        action={updateChapter.bind(null, novelId, chapterId)}
        submitLabel="Save changes"
        initial={{ title: chapter.title, body: chapter.body, isPublished: chapter.is_published }}
      />
      <div className="mt-8 border-t border-[var(--border)] pt-6">
        <DeleteChapterButton novelId={novelId} chapterId={chapterId} />
      </div>
    </div>
  );
}
