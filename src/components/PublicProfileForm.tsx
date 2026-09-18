"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateAvatar,
  updatePublicProfile,
  type ProfileActionState,
} from "@/lib/actions/profile";
import type { ProfileLink } from "@/lib/data/profile";

// Public profile editor: avatar, bio, links. Pen name lives with
// Author Mode in the same page. Each subsection saves on its own so
// tweaking one doesn't blow away drafts of another.
export function PublicProfileForm({
  initialAvatarUrl,
  initialBio,
  initialLinks,
  penNameForInitials,
}: {
  initialAvatarUrl: string | null;
  initialBio: string | null;
  initialLinks: ProfileLink[];
  penNameForInitials: string | null;
}) {
  return (
    <div className="space-y-6">
      <AvatarBlock initialAvatarUrl={initialAvatarUrl} penName={penNameForInitials} />
      <BioAndLinksBlock initialBio={initialBio} initialLinks={initialLinks} />
    </div>
  );
}

function AvatarBlock({
  initialAvatarUrl,
  penName,
}: {
  initialAvatarUrl: string | null;
  penName: string | null;
}) {
  const [state, formAction] = useActionState<ProfileActionState, FormData>(updateAvatar, {});
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-4">
      <AvatarPreview src={initialAvatarUrl} penName={penName} />
      <div className="flex flex-col gap-2 text-sm">
        <label className="text-xs">
          Avatar image
          <input
            ref={inputRef}
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="mt-1 block text-xs"
          />
          <span className="mt-1 block text-[11px] text-[var(--muted)]">JPG, PNG, WEBP or GIF. Under 2 MB.</span>
        </label>
        <AvatarSubmit />
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state.message && (
          <p className="text-xs text-green-700 dark:text-green-400">{state.message}</p>
        )}
      </div>
    </form>
  );
}

function AvatarSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-fit rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-medium hover:bg-[var(--surface)] disabled:opacity-60"
    >
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

function BioAndLinksBlock({
  initialBio,
  initialLinks,
}: {
  initialBio: string | null;
  initialLinks: ProfileLink[];
}) {
  const [state, formAction] = useActionState<ProfileActionState, FormData>(
    updatePublicProfile,
    {},
  );
  const [links, setLinks] = useState<ProfileLink[]>(
    initialLinks.length > 0 ? initialLinks : [{ label: "", url: "" }],
  );

  function updateLink(i: number, patch: Partial<ProfileLink>) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Bio</span>
        <textarea
          name="bio"
          rows={4}
          defaultValue={initialBio ?? ""}
          maxLength={800}
          placeholder="A short introduction — what you write, what you like to read."
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-[var(--muted)]">
          Plain text. Line breaks are kept. No HTML.
        </span>
      </label>

      <div>
        <p className="mb-1 text-sm font-medium">Links</p>
        <p className="mb-2 text-xs text-[var(--muted)]">
          Up to 5 http(s) links, shown on your author page. External links open with
          rel=&quot;nofollow noopener&quot;.
        </p>
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                name={`link_label_${i}`}
                value={link.label ?? ""}
                onChange={(e) => updateLink(i, { label: e.target.value })}
                maxLength={40}
                placeholder="Label"
                className="w-32 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
              <input
                type="url"
                name={`link_url_${i}`}
                value={link.url}
                onChange={(e) => updateLink(i, { url: e.target.value })}
                placeholder="https://…"
                className="min-w-[200px] flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeLink(i)}
                aria-label="Remove link"
                className="text-xs text-[var(--muted)] hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
          {links.length < 5 && (
            <button
              type="button"
              onClick={() => setLinks((prev) => [...prev, { label: "", url: "" }])}
              className="text-xs text-[var(--brand)] hover:underline"
            >
              + Add a link
            </button>
          )}
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && (
        <p className="text-sm text-green-700 dark:text-green-400">{state.message}</p>
      )}

      <BioSubmit />
    </form>
  );
}

function BioSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-medium text-[var(--brand-foreground)] disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save profile"}
    </button>
  );
}

export function AvatarPreview({ src, penName }: { src: string | null; penName: string | null }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={penName ?? "Avatar"}
        width={96}
        height={96}
        className="h-24 w-24 shrink-0 rounded-full object-cover ring-1 ring-[var(--border)]"
        unoptimized
      />
    );
  }
  const initials = penName ? penName.trim().slice(0, 2).toUpperCase() : "—";
  return (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[var(--border)] text-lg font-semibold text-[var(--muted)]">
      {initials}
    </div>
  );
}
