"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setNewPassword, type AuthActionState } from "@/lib/actions/auth";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-[var(--brand)] px-4 py-2 font-medium text-[var(--brand-foreground)] disabled:opacity-60"
    >
      {pending ? "Please wait…" : label}
    </button>
  );
}

export function NewPasswordForm() {
  const [state, formAction] = useActionState<AuthActionState, FormData>(setNewPassword, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}

      <SubmitButton label="Save new password" />
    </form>
  );
}
