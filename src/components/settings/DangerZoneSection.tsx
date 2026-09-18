"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  cancelAccountDeletion,
  requestAccountDeletion,
  type ProfileActionState,
} from "@/lib/actions/profile";

// The deletion flow: choose what happens to novels (only if you have
// any), type DELETE, re-enter your password, then submit. State is
// spelled out plainly before each control — what is removed, what is
// kept, what cannot be undone.
export function DangerZoneSection({
  hasNovels,
  novelCount,
  pendingDeletion,
}: {
  hasNovels: boolean;
  novelCount: number;
  pendingDeletion: boolean;
}) {
  if (pendingDeletion) {
    return <CancelDeletionCard />;
  }
  return <DeleteAccountCard hasNovels={hasNovels} novelCount={novelCount} />;
}

function CancelDeletionCard() {
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  function handle() {
    setMessage(null);
    startTransition(async () => {
      const result = await cancelAccountDeletion();
      setMessage(result.ok ? "Deletion cancelled. Your account is back to normal." : result.error ?? "Could not cancel.");
    });
  }
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
      <h3 className="text-sm font-semibold">Cancel scheduled deletion</h3>
      <p className="mt-1 mb-3 text-xs text-[var(--muted)]">
        This restores your account fully. Novels, comments, ratings and library
        come back on the next page load.
      </p>
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="rounded-full border border-[var(--brand)] px-4 py-1.5 text-sm font-medium text-[var(--brand)] disabled:opacity-60"
      >
        {busy ? "Cancelling…" : "Cancel deletion"}
      </button>
      {message && <p className="mt-3 text-xs">{message}</p>}
    </div>
  );
}

function DeleteAccountCard({ hasNovels, novelCount }: { hasNovels: boolean; novelCount: number }) {
  const [state, formAction] = useActionState<ProfileActionState, FormData>(
    requestAccountDeletion,
    {},
  );
  const [choice, setChoice] = useState<"keep_work" | "remove_work">(
    hasNovels ? "keep_work" : "remove_work",
  );

  return (
    <form action={formAction} className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
      <h3 className="text-sm font-semibold">Delete account</h3>
      <p className="mt-1 mb-3 text-xs">
        Your account is hidden immediately and permanently deleted 30 days later.
        Sign in during that window to cancel. After the 30 days pass this cannot
        be undone.
      </p>

      {hasNovels ? (
        <fieldset className="mb-3 space-y-2">
          <legend className="text-xs font-medium">
            You have {novelCount} novel{novelCount === 1 ? "" : "s"}. Choose what happens:
          </legend>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3">
            <input
              type="radio"
              name="choice"
              value="keep_work"
              checked={choice === "keep_work"}
              onChange={() => setChoice("keep_work")}
              className="mt-1"
            />
            <span className="text-xs">
              <span className="block text-sm font-medium">Keep them published</span>
              Novels and chapters stay readable, credited to &ldquo;Deleted user&rdquo;. Readers
              keep them in their libraries with progress intact. Your comments and
              ratings are anonymised, not removed, so threads stay whole.
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3">
            <input
              type="radio"
              name="choice"
              value="remove_work"
              checked={choice === "remove_work"}
              onChange={() => setChoice("remove_work")}
              className="mt-1"
            />
            <span className="text-xs">
              <span className="block text-sm font-medium">Remove them too</span>
              Novels, chapters, reactions and comments on those novels are all
              deleted. Readers&apos; library entries and reading progress for those
              novels vanish cleanly with them.
            </span>
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="choice" value="remove_work" />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          Type <code className="rounded bg-black/10 px-1">DELETE</code> to confirm
          <input
            type="text"
            name="confirmation"
            required
            autoComplete="off"
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

      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      {state.message && (
        <p className="mt-2 text-xs text-green-700 dark:text-green-400">{state.message}</p>
      )}

      <DeleteSubmit />
    </form>
  );
}

function DeleteSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 rounded-full bg-red-600 px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Scheduling…" : "Schedule deletion"}
    </button>
  );
}
