"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfile, type ProfileActionState } from "@/lib/actions/profile";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-[var(--brand)] px-5 py-2 font-medium text-[var(--brand-foreground)] disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function ProfileForm({
  initialPenName,
  initialIsAuthor,
}: {
  initialPenName: string | null;
  initialIsAuthor: boolean;
}) {
  const [state, formAction] = useActionState<ProfileActionState, FormData>(updateProfile, {});
  const [authorMode, setAuthorMode] = useState(initialIsAuthor);

  return (
    <form action={formAction} className="space-y-5">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="is_author"
          defaultChecked={initialIsAuthor}
          onChange={(e) => setAuthorMode(e.target.checked)}
          className="h-5 w-5"
        />
        <span>
          <span className="font-medium">Author Mode</span>
          <span className="block text-sm text-[var(--muted)]">
            Turn this on to publish your own novels and chapters.
          </span>
        </span>
      </label>

      {authorMode && (
        <div>
          <label htmlFor="pen_name" className="mb-1 block text-sm font-medium">
            Pen name
          </label>
          <input
            id="pen_name"
            name="pen_name"
            type="text"
            defaultValue={initialPenName ?? ""}
            required={authorMode}
            className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          />
          <p className="mt-1 text-sm text-[var(--muted)]">
            Shown publicly as the author on your novels.
          </p>
        </div>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}

      <SubmitButton />
    </form>
  );
}
