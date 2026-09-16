// Shared constants for novel classification. Mirrored in
// supabase/migrations/0007_classification.sql — change both together.

export const MAX_GENRES_PER_NOVEL = 9;

// A brand-new author-created tag stays out of Browse's filter list and
// the blocked-tags list until this many DIFFERENT novels are using it
// (or the site owner has approved it by hand). It still works on the
// novel it was created for. The gate is on discovery, not on use.
export const TAG_APPROVAL_MIN_NOVELS = 3;

export const MAX_TAG_NAME_LENGTH = 40;

// Fixed demographic list. Authors pick one or none; they can't extend
// it. The DB enforces the same list via a CHECK constraint on
// novels.demographic.
export type Demographic = "shounen" | "shoujo" | "seinen" | "josei" | "general";

export const DEMOGRAPHICS: ReadonlyArray<{ value: Demographic; label: string }> = [
  { value: "shounen", label: "Shounen" },
  { value: "shoujo", label: "Shoujo" },
  { value: "seinen", label: "Seinen" },
  { value: "josei", label: "Josei" },
  { value: "general", label: "General" },
];

export function demographicLabel(value: Demographic | null): string | null {
  if (!value) return null;
  return DEMOGRAPHICS.find((d) => d.value === value)?.label ?? null;
}

// Normalise a proposed tag name the same way the DB does. Only used to
// pre-warn the author on the client — the DB's normalise_tag_name() is
// still the truth for what counts as a match.
export function normaliseTagName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
