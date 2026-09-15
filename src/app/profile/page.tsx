import { redirect } from "next/navigation";
import { BlockedTagsSection } from "@/components/BlockedTagsSection";
import { ProfileForm } from "@/components/ProfileForm";
import { getBlockedTagIds } from "@/lib/data/blockedTags";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { getTags } from "@/lib/data/taxonomy";

export default async function ProfilePage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");

  const [tags, blockedIds] = await Promise.all([getTags(), getBlockedTagIds(user.id)]);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Your profile</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">{user.email}</p>
      <ProfileForm initialPenName={profile?.pen_name ?? null} initialIsAuthor={profile?.is_author ?? false} />
      <BlockedTagsSection allTags={tags} initialBlockedIds={blockedIds} />
    </div>
  );
}
