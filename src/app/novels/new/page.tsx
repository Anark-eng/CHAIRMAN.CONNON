import { redirect } from "next/navigation";
import { NovelForm } from "@/components/NovelForm";
import { createNovel } from "@/lib/actions/novels";
import { getGenres, getTags } from "@/lib/data/taxonomy";
import { getCurrentUserAndProfile } from "@/lib/data/profile";

export default async function NewNovelPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (!profile?.is_author) redirect("/profile");

  const [genres, tags] = await Promise.all([getGenres(), getTags()]);

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Start a new novel</h1>
      <NovelForm action={createNovel} genres={genres} tags={tags} submitLabel="Create novel" />
    </div>
  );
}
