"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { NovelActionState } from "@/lib/actions/novels";
import type { GenreOption, TagOption } from "@/lib/data/types";
import type { NovelStatus } from "@/lib/supabase/database.types";

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

export function NovelForm({
  action,
  genres,
  tags,
  submitLabel,
  initial,
}: {
  action: (state: NovelActionState, formData: FormData) => Promise<NovelActionState>;
  genres: GenreOption[];
  tags: TagOption[];
  submitLabel: string;
  initial?: {
    title: string;
    synopsis: string;
    genreId: string | null;
    status: NovelStatus;
    tagIds: string[];
    coverUrl: string | null;
  };
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          Title
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
        <label htmlFor="synopsis" className="mb-1 block text-sm font-medium">
          Synopsis
        </label>
        <textarea
          id="synopsis"
          name="synopsis"
          rows={5}
          defaultValue={initial?.synopsis}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="genre_id" className="mb-1 block text-sm font-medium">
            Genre
          </label>
          <select
            id="genre_id"
            name="genre_id"
            defaultValue={initial?.genreId ?? ""}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          >
            <option value="">No genre</option>
            {genres.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={initial?.status ?? "ongoing"}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          >
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="hiatus">On hiatus</option>
          </select>
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium">Tags</span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {tags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="tag_ids"
                value={tag.id}
                defaultChecked={initial?.tagIds.includes(tag.id)}
              />
              {tag.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="cover" className="mb-1 block text-sm font-medium">
          Cover image
        </label>
        {initial?.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={initial.coverUrl} alt="Current cover" className="mb-2 h-32 w-24 rounded object-cover" />
        )}
        <input id="cover" name="cover" type="file" accept="image/*" className="text-sm" />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
