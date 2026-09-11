import Link from "next/link";
import { redirect } from "next/navigation";
import { NovelCard } from "@/components/NovelCard";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getLibrary } from "@/lib/data/library";

export default async function LibraryPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");

  const items = await getLibrary(user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Your library</h1>

      {items.length === 0 ? (
        <p className="text-[var(--muted)]">
          Nothing saved yet.{" "}
          <Link href="/browse" className="text-[var(--brand)]">
            Browse novels
          </Link>{" "}
          to add some.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map(({ novel, hasUnread }) => (
            <div key={novel.id} className="relative">
              {hasUnread && (
                <span className="absolute right-2 top-2 z-10 rounded-full bg-[var(--brand)] px-2 py-0.5 text-xs font-medium text-[var(--brand-foreground)]">
                  New
                </span>
              )}
              <NovelCard novel={novel} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
