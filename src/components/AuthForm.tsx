"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthActionState } from "@/lib/actions/auth";

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

export function AuthForm({
  action,
  submitLabel,
}: {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
