import { notFound, redirect } from "next/navigation";
import { createChapterAndOpen } from "@/lib/actions/chapters";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getNovelById } from "@/lib/data/novels";

// Creates an empty draft row and sends the author into the editor for
// that id. Autosave then has a chapter to write to from the first
// keystroke. Keeps the "type a title, paste, publish" path short: no
// intermediate form.
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

  await createChapterAndOpen(novelId);
}
