"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changeEmail, changePassword, type ProfileActionState } from "@/lib/actions/profile";

export function AccountBasicsSection({ currentEmail }: { currentEmail: string }) {
  return (
    <div className="space-y-6">
      <ChangePasswordForm />
      <ChangeEmailForm currentEmail={currentEmail} />
    </div>
  );
}

function ChangePasswordForm() {
  const [state, formAction] = useActionState<ProfileActionState, FormData>(changePassword, {});
  return (
    <form action={formAction} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-semibold">Change password</h3>
      <p className="mt-1 mb-3 text-xs text-[var(--muted)]">
        Re-enter your current password to confirm it&apos;s you.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          Current password
          <input
            type="password"
            name="current_password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs">
          New password (8+ characters)
          <input
            type="password"
            name="new_password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 block w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <StatusRow state={state} />
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}

function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction] = useActionState<ProfileActionState, FormData>(changeEmail, {});
  return (
    <form action={formAction} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-semibold">Change email</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Email changes require a confirmation link Supabase sends to the new address.
      </p>
      <p className="mt-1 mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs">
        <strong>Heads up:</strong> this project doesn&apos;t have a custom email sender yet,
        so Supabase will only actually deliver the confirmation to addresses on the
        project team&apos;s allowlist. If yours isn&apos;t there, the change won&apos;t go
        through — sit tight until that&apos;s wired up.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          New email
          <input
            type="email"
            name="new_email"
            required
            defaultValue=""
            placeholder={currentEmail}
            className="mt-1 block w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs">
          Current password
          <input
            type="password"
            name="current_password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <StatusRow state={state} />
      <SubmitButton>Request email change</SubmitButton>
    </form>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-[var(--brand-foreground)] disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function StatusRow({ state }: { state: ProfileActionState }) {
  if (!state.error && !state.message) return null;
  return (
    <p className={"mt-2 text-xs " + (state.error ? "text-red-600" : "text-green-700 dark:text-green-400")}>
      {state.error ?? state.message}
    </p>
  );
}
