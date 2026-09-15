import { redirect } from "next/navigation";
import { NewPasswordForm } from "@/components/NewPasswordForm";
import { getCurrentUserAndProfile } from "@/lib/data/profile";

export default async function ResetPasswordPage() {
  // Readers only reach this page after clicking a reset-password link that
  // ran through /auth/callback and put a session on the request. Without a
  // session they can't set a new password — send them to /auth/error,
  // which explains the link expired or was already used.
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/auth/error");

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Set a new password</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        You&apos;re logged in for this reset. Pick a new password below.
      </p>
      <NewPasswordForm />
    </div>
  );
}
