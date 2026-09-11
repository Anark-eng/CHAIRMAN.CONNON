"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ChapterActionState } from "@/lib/actions/chapters";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-[var(--brand)] px-5 py-2 font-medium text-[var(--brand-foreground)] disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function ChapterForm({
  action,
  submitLabel,
  initial,
}: {
  action: (state: ChapterActionState, formData: FormData) => Promise<ChapterActionState>;
  submitLabel: string;
  initial?: { title: string; body: string; isPublished: boolean };
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          Chapter title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={initial?.title}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="body" className="mb-1 block text-sm font-medium">
          Chapter text
        </label>
        <textarea
          id="body"
          name="body"
          rows={18}
          required
          defaultValue={initial?.body}
          placeholder="Separate paragraphs with a blank line."
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-serif"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="publish" defaultChecked={initial?.isPublished ?? false} />
        Publish now (leave unchecked to save as a draft)
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
