"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { CommentActionState } from "@/lib/actions/comments";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] disabled:opacity-60"
    >
      {pending ? "Posting…" : label}
    </button>
  );
}

// Shared comment form. `hiddenFields` passes extra values (like parent_id
// for a chapter reply). `onSubmitted` is called after a successful post so
// a reply form can close itself.
export function CommentForm({
  action,
  submitLabel = "Post comment",
  placeholder = "Write a comment…",
  hiddenFields = {},
  onSubmitted,
  small = false,
}: {
  action: (state: CommentActionState, formData: FormData) => Promise<CommentActionState>;
  submitLabel?: string;
  placeholder?: string;
  hiddenFields?: Record<string, string>;
  onSubmitted?: () => void;
  small?: boolean;
}) {
  const [state, formAction] = useActionState<CommentActionState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error && onSubmitted) onSubmitted();
    return result;
  }, {});

  return (
    <form
      action={formAction}
      className={"space-y-2 " + (small ? "" : "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3")}
    >
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <textarea
        name="body"
        required
        rows={small ? 3 : 4}
        placeholder={placeholder}
        maxLength={4000}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <input type="checkbox" name="is_spoiler" />
          Mark as spoiler
        </label>
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
