import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { PublicProfileForm } from "@/components/PublicProfileForm";
import { getCurrentUserAndProfile, RESERVED_DELETED_USER_ID } from "@/lib/data/profile";

export default async function ProfilePage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (user.id === RESERVED_DELETED_USER_ID) redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Public — anyone can see this. For email, password, blocked tags and
          account deletion, go to{" "}
          <Link href="/settings" className="underline hover:text-[var(--foreground)]">
            account settings
          </Link>
          .
        </p>
        {profile && (
          <p className="mt-3 text-xs">
            <Link
              href={`/authors/${user.id}`}
              className="text-[var(--brand)] hover:underline"
            >
              View your public author page →
            </Link>
          </p>
        )}
      </header>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Author Mode &amp; pen name</h2>
        <ProfileForm
          initialPenName={profile?.pen_name ?? null}
          initialIsAuthor={profile?.is_author ?? false}
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Avatar, bio &amp; links</h2>
        <PublicProfileForm
          initialAvatarUrl={profile?.avatar_url ?? null}
          initialBio={profile?.bio ?? null}
          initialLinks={profile?.links ?? []}
          penNameForInitials={profile?.pen_name ?? null}
        />
      </section>
    </div>
  );
}
