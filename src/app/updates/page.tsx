import Link from "next/link";
import { redirect } from "next/navigation";
import { CoverThumb } from "@/components/CoverThumb";
import { StatusBadge } from "@/components/StatusBadge";
import { getLibraryUpdates } from "@/lib/data/library";
import { getCurrentUserAndProfile } from "@/lib/data/profile";

export default async function UpdatesPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");

  const items = await getLibraryUpdates(user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Updates</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Novels in your library with chapters you haven&apos;t read yet, newest updates first.
      </p>

      {items.length === 0 ? (
        <p className="text-[var(--muted)]">
          Nothing new right now.{" "}
          <Link href="/library" className="text-[var(--brand)]">
            Your library
          </Link>
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map(({ novel, unreadCount, latestChapterAt }) => (
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
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {novel.authorPenName ?? "Unknown author"}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                  <StatusBadge status={novel.status} />
                  {latestChapterAt && <span>Updated {new Date(latestChapterAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[var(--brand-foreground)]">
                {unreadCount} unread
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
