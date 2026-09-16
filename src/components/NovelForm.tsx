"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { NovelActionState } from "@/lib/actions/novels";
import { createTag } from "@/lib/actions/tags";
import type { Demographic, GenreOption, TagOption } from "@/lib/data/types";
import type { NovelStatus } from "@/lib/supabase/database.types";
import {
  DEMOGRAPHICS,
  MAX_GENRES_PER_NOVEL,
  MAX_TAG_NAME_LENGTH,
  normaliseTagName,
} from "@/lib/classification";
import { SearchablePicker, type PickerItem } from "./SearchablePicker";

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
    genreIds: string[];
    demographic: Demographic | null;
    status: NovelStatus;
    tagIds: string[];
    coverUrl: string | null;
  };
}) {
  const [state, formAction] = useActionState(action, {});

  const [selectedGenres, setSelectedGenres] = useState<GenreOption[]>(() =>
    (initial?.genreIds ?? []).map((id) => genres.find((g) => g.id === id)).filter((g): g is GenreOption => Boolean(g)),
  );

  const [availableTags, setAvailableTags] = useState<TagOption[]>(tags);
  const [selectedTags, setSelectedTags] = useState<TagOption[]>(() =>
    (initial?.tagIds ?? []).map((id) => tags.find((t) => t.id === id)).filter((t): t is TagOption => Boolean(t)),
  );

  const [creatingTag, setCreatingTag] = useState(false);
  const [tagFeedback, setTagFeedback] = useState<string | null>(null);
  const [, startCreateTagTransition] = useTransition();

  const genrePool: PickerItem[] = useMemo(() => genres.map((g) => ({ id: g.id, name: g.name })), [genres]);
  const tagPool: PickerItem[] = useMemo(
    () => availableTags.map((t) => ({ id: t.id, name: t.name })),
    [availableTags],
  );

  function handleCreateTag(name: string) {
    setTagFeedback(null);
    startCreateTagTransition(async () => {
      setCreatingTag(true);
      try {
        const result = await createTag(name);
        if (!result.ok || !result.tag) {
          setTagFeedback(result.error ?? "Could not create the tag.");
          return;
        }
        const tag = result.tag;
        setAvailableTags((prev) => (prev.find((t) => t.id === tag.id) ? prev : [...prev, tag]));
        setSelectedTags((prev) => (prev.find((t) => t.id === tag.id) ? prev : [...prev, tag]));
        if (!result.wasCreated) {
          setTagFeedback(`Using existing tag "${tag.name}" instead.`);
        } else if (!tag.is_approved) {
          setTagFeedback(
            `Added "${tag.name}". New tags don't appear in Browse's filter list until a few different novels use them.`,
          );
        }
      } finally {
        setCreatingTag(false);
      }
    });
  }

  return (
    <form action={formAction} className="space-y-6">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="demographic" className="mb-1 block text-sm font-medium">
            Demographic
          </label>
          <select
            id="demographic"
            name="demographic"
            defaultValue={initial?.demographic ?? ""}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          >
            <option value="">No demographic</option>
            {DEMOGRAPHICS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
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
        <span className="mb-1 block text-sm font-medium">
          Genres <span className="text-xs font-normal text-[var(--muted)]">up to {MAX_GENRES_PER_NOVEL}</span>
        </span>
        <SearchablePicker
          pool={genrePool}
          selected={selectedGenres.map((g) => ({ id: g.id, name: g.name }))}
          onChange={(next) =>
            setSelectedGenres(next.map((n) => genres.find((g) => g.id === n.id) ?? { id: n.id, name: n.name, slug: n.id }))
          }
          placeholder="Search genres…"
          emptyLabel="No matching genres."
          max={MAX_GENRES_PER_NOVEL}
          maxHelper={`You've hit the ${MAX_GENRES_PER_NOVEL}-genre cap. Remove one to add another.`}
        />
        {selectedGenres.map((g) => (
          <input key={g.id} type="hidden" name="genre_ids" value={g.id} />
        ))}
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium">
          Tags <span className="text-xs font-normal text-[var(--muted)]">no cap; you can add new ones</span>
        </span>
        <SearchablePicker
          pool={tagPool}
          selected={selectedTags.map((t) => ({ id: t.id, name: t.name }))}
          onChange={(next) =>
            setSelectedTags(
              next.map(
                (n) => availableTags.find((t) => t.id === n.id) ?? { id: n.id, name: n.name, slug: n.id },
              ),
            )
          }
          placeholder="Search tags — or type a new one below…"
          emptyLabel="No matching tags."
          extra={(query) => {
            const trimmed = query.trim();
            if (!trimmed) return null;
            if (trimmed.length > MAX_TAG_NAME_LENGTH) {
              return (
                <p className="text-xs text-[var(--muted)]">Tag names cap at {MAX_TAG_NAME_LENGTH} characters.</p>
              );
            }
            const normalisedQuery = normaliseTagName(trimmed);
            if (!normalisedQuery) return null;
            const exists = availableTags.some((t) => normaliseTagName(t.name) === normalisedQuery);
            if (exists) return null;
            return (
              <button
                type="button"
                onClick={() => handleCreateTag(trimmed)}
                disabled={creatingTag}
                className="rounded-full border border-dashed border-[var(--brand)] px-3 py-1 text-xs font-medium text-[var(--brand)] disabled:opacity-60"
              >
                {creatingTag ? "Adding…" : `Create tag: "${trimmed}"`}
              </button>
            );
          }}
        />
        {tagFeedback && <p className="mt-2 text-xs text-[var(--muted)]">{tagFeedback}</p>}
        {selectedTags.map((t) => (
          <input key={t.id} type="hidden" name="tag_ids" value={t.id} />
        ))}
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
