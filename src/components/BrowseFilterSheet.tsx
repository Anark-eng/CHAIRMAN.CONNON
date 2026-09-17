"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DEMOGRAPHICS, type TagGroup } from "@/lib/classification";
import type { GenreOption, NovelStatus, TagOption } from "@/lib/data/types";
import type { GroupedTags, TagUsage } from "@/lib/data/taxonomy";

// The Browse filter sheet: a full-screen sheet on phones, a
// right-docked panel on desktops. Fires filter changes into the URL so
// results, refresh and back-button all work.
//
// The three-state tag control is preserved exactly: first tap = require,
// second = exclude, third = clear. Distinct visually AND by the "Require /
// Exclude / —" text next to the state indicator, never by colour alone.
interface BrowseFilterSheetProps {
  open: boolean;
  onClose: () => void;
  genres: GenreOption[];
  groupedTags: GroupedTags;
  initialGenreSlugs: string[];
  initialDemographic: string;
  initialStatuses: NovelStatus[];
  initialIncludeSlugs: string[];
  initialExcludeSlugs: string[];
}

// Outer wrapper decides when the sheet is mounted; the inner Body
// carries all local state so opening the sheet always starts from the
// props (current URL state) with no stale-edit surprises.
export function BrowseFilterSheet(props: BrowseFilterSheetProps) {
  if (!props.open) return null;
  return <BrowseFilterSheetBody {...props} />;
}

function BrowseFilterSheetBody({
  onClose,
  genres,
  groupedTags,
  initialGenreSlugs,
  initialDemographic,
  initialStatuses,
  initialIncludeSlugs,
  initialExcludeSlugs,
}: BrowseFilterSheetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [genreSlugs, setGenreSlugs] = useState<Set<string>>(new Set(initialGenreSlugs));
  const [demographic, setDemographic] = useState<string>(initialDemographic);
  const [statuses, setStatuses] = useState<Set<NovelStatus>>(new Set(initialStatuses));
  const [include, setInclude] = useState<Set<string>>(new Set(initialIncludeSlugs));
  const [exclude, setExclude] = useState<Set<string>>(new Set(initialExcludeSlugs));
  const [tagQuery, setTagQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<TagGroup>>(new Set(["content_warnings"]));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [onClose]);

  const stateFor = (slug: string): TagTriState =>
    include.has(slug) ? "include" : exclude.has(slug) ? "exclude" : "none";

  function cycleTag(slug: string) {
    const s = stateFor(slug);
    const nextInclude = new Set(include);
    const nextExclude = new Set(exclude);
    nextInclude.delete(slug);
    nextExclude.delete(slug);
    if (s === "none") nextInclude.add(slug);
    else if (s === "include") nextExclude.add(slug);
    setInclude(nextInclude);
    setExclude(nextExclude);
  }

  function toggleGenre(slug: string) {
    const next = new Set(genreSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setGenreSlugs(next);
  }

  function toggleStatus(v: NovelStatus) {
    const next = new Set(statuses);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setStatuses(next);
  }

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    setParam(params, "genre", [...genreSlugs]);
    if (demographic) params.set("demographic", demographic);
    else params.delete("demographic");
    setParam(params, "status", [...statuses]);
    setParam(params, "include", [...include]);
    setParam(params, "exclude", [...exclude]);
    router.push(`${pathname}?${params.toString()}`);
    onClose();
  }

  function resetAll() {
    setGenreSlugs(new Set());
    setDemographic("");
    setStatuses(new Set());
    setInclude(new Set());
    setExclude(new Set());
  }

  const matchesQuery = (t: TagOption) =>
    tagQuery.trim() === "" || t.name.toLowerCase().includes(tagQuery.trim().toLowerCase());

  const filteredGroups = useMemo(() => {
    if (tagQuery.trim() === "") return groupedTags.groups;
    return groupedTags.groups.map((g) => ({
      ...g,
      tags: g.tags.filter((u) => matchesQuery(u.tag)),
    }));
    // matchesQuery not memo-stable; safe because groups is small.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedTags.groups, tagQuery]);

  const filteredTop = useMemo(
    () => groupedTags.top.filter((u) => matchesQuery(u.tag)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupedTags.top, tagQuery],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="presentation">
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
        className={
          "relative flex flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] " +
          "shadow-xl w-full max-h-[92vh] rounded-t-2xl " +
          "sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-2xl"
        }
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 id="filter-sheet-title" className="text-base font-semibold">
            Filters
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="reader-hit flex items-center justify-center rounded-full hover:bg-[var(--surface)]"
          >
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <Section label="Genres" note="A novel can carry several. Pick any that fit.">
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => {
                const active = genreSlugs.has(g.slug);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGenre(g.slug)}
                    aria-pressed={active}
                    className={
                      "rounded-full border px-3 py-1 text-xs " +
                      (active
                        ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]")
                    }
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section label="Demographic">
            <div className="flex flex-wrap gap-1.5">
              <ChipRadio
                label="Any"
                active={demographic === ""}
                onClick={() => setDemographic("")}
              />
              {DEMOGRAPHICS.map((d) => (
                <ChipRadio
                  key={d.value}
                  label={d.label}
                  active={demographic === d.value}
                  onClick={() => setDemographic(d.value)}
                />
              ))}
            </div>
          </Section>

          <Section label="Status">
            <div className="flex flex-wrap gap-1.5">
              {(["ongoing", "completed", "hiatus"] as NovelStatus[]).map((s) => (
                <ChipRadio
                  key={s}
                  label={s[0].toUpperCase() + s.slice(1)}
                  active={statuses.has(s)}
                  onClick={() => toggleStatus(s)}
                />
              ))}
            </div>
          </Section>

          <Section
            label="Tags"
            note="Tap to require, again to exclude, again to clear."
          >
            <input
              type="search"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Type to find a tag…"
              className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              aria-label="Search tags"
            />

            {tagQuery.trim() === "" && filteredTop.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Most used
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {filteredTop.map((u) => (
                    <TagChip key={u.tag.id} usage={u} state={stateFor(u.tag.slug)} onClick={cycleTag} />
                  ))}
                </div>
              </div>
            )}

            {filteredGroups.map((group) => (
              <TagGroupBlock
                key={group.key}
                groupKey={group.key}
                label={group.label}
                description={group.description}
                tags={group.tags}
                stateFor={stateFor}
                onCycle={cycleTag}
                isOpen={openGroups.has(group.key) || tagQuery.trim() !== ""}
                onToggleOpen={() =>
                  setOpenGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.key)) next.delete(group.key);
                    else next.add(group.key);
                    return next;
                  })
                }
                extraFooter={
                  group.key === "content_warnings" ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      To block a tag permanently, use{" "}
                      <Link href="/profile" className="underline hover:text-[var(--foreground)]">
                        Blocked tags on your profile
                      </Link>
                      .
                    </p>
                  ) : null
                }
              />
            ))}
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={resetAll}
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] underline"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-[var(--brand-foreground)]"
          >
            Apply filters
          </button>
        </footer>
      </div>
    </div>
  );
}

function setParam(params: URLSearchParams, key: string, values: string[]) {
  if (values.length === 0) params.delete(key);
  else params.set(key, values.join(","));
}

type TagTriState = "none" | "include" | "exclude";

function Section({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h3 className="text-sm font-semibold">{label}</h3>
      {note && <p className="mb-2 text-xs text-[var(--muted)]">{note}</p>}
      {!note && <div className="h-2" />}
      {children}
    </section>
  );
}

function ChipRadio({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-full border px-3 py-1 text-xs " +
        (active
          ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
          : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]")
      }
    >
      {label}
    </button>
  );
}

function TagGroupBlock({
  groupKey,
  label,
  description,
  tags,
  stateFor,
  onCycle,
  isOpen,
  onToggleOpen,
  extraFooter,
}: {
  groupKey: TagGroup;
  label: string;
  description?: string;
  tags: TagUsage[];
  stateFor: (slug: string) => TagTriState;
  onCycle: (slug: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  extraFooter?: React.ReactNode;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="mb-3 rounded-xl border border-[var(--border)]">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-controls={`tag-group-${groupKey}`}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
      >
        <span>
          {label}
          <span className="ml-2 text-xs font-normal text-[var(--muted)]">{tags.length}</span>
        </span>
        <span aria-hidden className="text-lg text-[var(--muted)]">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen && (
        <div id={`tag-group-${groupKey}`} className="border-t border-[var(--border)] px-3 py-3">
          {description && <p className="mb-2 text-xs text-[var(--muted)]">{description}</p>}
          <div className="flex flex-wrap gap-1.5">
            {tags.map((u) => (
              <TagChip key={u.tag.id} usage={u} state={stateFor(u.tag.slug)} onClick={onCycle} />
            ))}
          </div>
          {extraFooter}
        </div>
      )}
    </div>
  );
}

function TagChip({
  usage,
  state,
  onClick,
}: {
  usage: TagUsage;
  state: TagTriState;
  onClick: (slug: string) => void;
}) {
  const stateLabel = state === "include" ? "Required" : state === "exclude" ? "Excluded" : "Off";
  const prefix = state === "include" ? "✓ " : state === "exclude" ? "✕ " : "";
  const className =
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
    (state === "include"
      ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
      : state === "exclude"
        ? "border-red-600 bg-red-600/10 text-red-700 line-through dark:text-red-400"
        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]");
  return (
    <button
      type="button"
      onClick={() => onClick(usage.tag.slug)}
      aria-pressed={state !== "none"}
      aria-label={`${usage.tag.name} — ${stateLabel}`}
      title={`${usage.tag.name} — ${stateLabel} (used by ${usage.novelCount} novel${usage.novelCount === 1 ? "" : "s"})`}
      className={className}
    >
      <span aria-hidden>{prefix}</span>
      {usage.tag.name}
    </button>
  );
}
