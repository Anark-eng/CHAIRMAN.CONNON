import Link from "next/link";
import { redirect } from "next/navigation";
import { BlockedTagsSection } from "@/components/BlockedTagsSection";
import { AccountBasicsSection } from "@/components/settings/AccountBasicsSection";
import { DangerZoneSection } from "@/components/settings/DangerZoneSection";
import { DataExportSection } from "@/components/settings/DataExportSection";
import { getBlockedTagIds } from "@/lib/data/blockedTags";
import { getCurrentUserAndProfile, RESERVED_DELETED_USER_ID } from "@/lib/data/profile";
import { getTags } from "@/lib/data/taxonomy";
import { createClient } from "@/lib/supabase/server";

// Private account settings. Public profile fields (pen name, avatar,
// bio, links) live on /profile with the person's other public
// choices; this page holds email, password, blocked tags, data
// export, and account deletion. One scrollable page, most-used first,
// destructive last.
export default async function SettingsPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (user.id === RESERVED_DELETED_USER_ID) redirect("/");

  const supabase = await createClient();
  const [{ count: novelCount }, allTags, blockedIds] = await Promise.all([
    supabase.from("novels").select("id", { count: "exact", head: true }).eq("author_id", user.id),
    getTags(),
    getBlockedTagIds(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Private to you.{" "}
          <Link href="/profile" className="underline hover:text-[var(--foreground)]">
            Your public profile
          </Link>{" "}
          is where you edit your pen name, avatar, bio and links.
        </p>
      </header>

      {profile?.deleted_at && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-medium">Your account is scheduled for deletion.</p>
          <p className="mt-1 text-[var(--muted)]">
            Marked on {new Date(profile.deleted_at).toLocaleString()}. It finalizes
            30 days after that. Sign in and cancel from the Danger zone below to
            keep your account.
          </p>
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Sign-in</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          You&apos;re signed in as <span className="font-medium text-[var(--foreground)]">{user.email}</span>.
        </p>
        <AccountBasicsSection currentEmail={user.email ?? ""} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Blocked tags</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Novels carrying these tags stay out of your lists. A direct link still
          works, with a quiet notice at the top.
        </p>
        <BlockedTagsSection allTags={allTags} initialBlockedIds={blockedIds} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Export your data</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Download everything the site holds about you: profile, library, reading
          progress, ratings, comments, and your own novels and chapters.
        </p>
        <DataExportSection />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-red-600 dark:text-red-400">Danger zone</h2>
        <DangerZoneSection
          hasNovels={(novelCount ?? 0) > 0}
          novelCount={novelCount ?? 0}
          pendingDeletion={profile?.deleted_at !== null && profile?.deleted_at !== undefined}
        />
      </section>
    </div>
  );
}
