import Link from "next/link";
import { redirect } from "next/navigation";
import { CoverThumb } from "@/components/CoverThumb";
import { StatusBadge } from "@/components/StatusBadge";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getMyNovels } from "@/lib/data/novels";

export default async function MyNovelsPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (!profile?.is_author) redirect("/profile");

  const novels = await getMyNovels(user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My novels</h1>
        <Link
          href="/novels/new"
          className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)]"
        >
          New novel
        </Link>
      </div>

      {novels.length === 0 ? (
        <p className="text-[var(--muted)]">You haven&apos;t started a novel yet.</p>
      ) : (
        <ul className="space-y-4">
          {novels.map((novel) => (
            <li
              key={novel.id}
              className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="w-16 shrink-0">
                <CoverThumb src={novel.cover_url} title={novel.title} />
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/novels/${novel.id}`} className="font-medium hover:text-[var(--brand)]">
                  {novel.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                  <StatusBadge status={novel.status} />
                  <span>
                    {novel.chapterCount} chapter{novel.chapterCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 text-sm">
                <Link href={`/novels/${novel.id}/chapters/new`} className="text-[var(--brand)]">
                  Add chapter
                </Link>
                <Link href={`/novels/${novel.id}/edit`} className="text-[var(--muted)]">
                  Edit details
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
