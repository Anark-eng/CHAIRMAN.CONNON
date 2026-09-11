import { notFound, redirect } from "next/navigation";
import { ChapterForm } from "@/components/ChapterForm";
import { createChapter } from "@/lib/actions/chapters";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getNovelById } from "@/lib/data/novels";

export default async function NewChapterPage({
  params,
}: {
  params: Promise<{ novelId: string }>;
}) {
  const { novelId } = await params;
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");

  const novel = await getNovelById(novelId);
  if (!novel) notFound();
  if (novel.author_id !== user.id) redirect(`/novels/${novelId}`);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-1 text-2xl font-semibold">New chapter</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">{novel.title}</p>
      <ChapterForm action={createChapter.bind(null, novelId)} submitLabel="Save chapter" />
    </div>
  );
}
