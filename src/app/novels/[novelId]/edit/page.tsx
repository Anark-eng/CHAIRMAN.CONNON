import { notFound, redirect } from "next/navigation";
import { DeleteNovelButton } from "@/components/DeleteNovelButton";
import { NovelForm } from "@/components/NovelForm";
import { updateNovel } from "@/lib/actions/novels";
import { getGenres, getTags } from "@/lib/data/taxonomy";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getNovelById } from "@/lib/data/novels";

export default async function EditNovelPage({
  params,
}: {
  params: Promise<{ novelId: string }>;
}) {
  const { novelId } = await params;
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");

  const [novel, genres, tags] = await Promise.all([getNovelById(novelId), getGenres(), getTags()]);
  if (!novel) notFound();
  if (novel.author_id !== user.id) redirect(`/novels/${novelId}`);

  const boundUpdate = updateNovel.bind(null, novelId);

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Edit novel</h1>
      <NovelForm
        action={boundUpdate}
        genres={genres}
        tags={tags}
        submitLabel="Save changes"
        initial={{
          title: novel.title,
          synopsis: novel.synopsis,
          genreId: novel.genre?.id ?? null,
          status: novel.status,
          tagIds: novel.tags.map((t) => t.id),
          coverUrl: novel.cover_url,
        }}
      />
      <div className="mt-8 border-t border-[var(--border)] pt-6">
        <DeleteNovelButton novelId={novelId} />
      </div>
    </div>
  );
}
