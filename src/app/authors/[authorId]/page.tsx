import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NovelCard } from "@/components/NovelCard";
import { AvatarPreview } from "@/components/PublicProfileForm";
import { getNovelsByAuthor, getPublicProfile } from "@/lib/data/novels";
import { loadBlocklist } from "@/lib/data/blockedTags";
import { getCurrentUserAndProfile, RESERVED_DELETED_USER_ID } from "@/lib/data/profile";

// Public author profile: pen name, avatar, bio, links, and their
// novels. A person who has never written still has a profile — it just
// has no novels on it. If the account has been soft-deleted, the page
// remains reachable but says so plainly (novels are hidden site-wide
// by RLS until finalisation).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ authorId: string }>;
}): Promise<Metadata> {
  const { authorId } = await params;
  const profile = await getPublicProfile(authorId);
  const displayName = profile?.pen_name ?? "Unknown author";
  return {
    title: `${displayName} — NovelTrend`,
    description: profile?.bio?.slice(0, 200) ?? `Novels by ${displayName} on NovelTrend.`,
  };
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ authorId: string }>;
}) {
  const { authorId } = await params;
  const { user } = await getCurrentUserAndProfile();

  const [profile, novels, blocklist] = await Promise.all([
    getPublicProfile(authorId),
    getNovelsByAuthor(authorId),
    loadBlocklist(user?.id ?? null),
  ]);

  if (!profile) notFound();

  const isSelf = user?.id === profile.id;
  const isDeletedPending = profile.deleted_at !== null && !isSelf;
  const isReserved = profile.id === RESERVED_DELETED_USER_ID;

  // Apply the reader's blocklist to the visible list. Direct novel-page
  // links still work (with the existing quiet notice) even for blocked
  // ones — this just keeps the author page consistent with other lists.
  const visibleNovels = novels.filter((n) => !blocklist.excludedNovelIds.has(n.id));

  if (isDeletedPending) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">This account is no longer available</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          The person behind this profile asked to delete their account.
        </p>
      </div>
    );
  }

  const displayName = profile.pen_name ?? (isReserved ? "Deleted user" : "Unknown author");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start">
        <AvatarPreview src={profile.avatar_url} penName={profile.pen_name} />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Author</p>
          <h1 className="mt-1 text-2xl font-semibold">{displayName}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {novels.length} novel{novels.length === 1 ? "" : "s"}
          </p>

          {profile.bio && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--foreground)]">
              {profile.bio}
            </p>
          )}

          {profile.links.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {profile.links.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    rel="nofollow noopener"
                    target="_blank"
                    className="rounded-full border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--surface)]"
                  >
                    {link.label ?? link.url}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {isSelf && (
            <p className="mt-3 text-xs">
              <Link href="/profile" className="text-[var(--brand)] hover:underline">
                Edit your public profile →
              </Link>
            </p>
          )}
        </div>
      </header>

      {visibleNovels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Nothing to show here yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {visibleNovels.map((n) => (
            <NovelCard key={n.id} novel={n} />
          ))}
        </div>
      )}
    </div>
  );
}
