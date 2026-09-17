"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BrowseFilterSheet } from "@/components/BrowseFilterSheet";
import { DEMOGRAPHICS } from "@/lib/classification";
import { SEARCH_SORTS, type SearchSort } from "@/lib/browseSort";
import type { GenreOption, NovelStatus } from "@/lib/data/types";
import type { GroupedTags } from "@/lib/data/taxonomy";

// Top strip on Browse: search box, sort control, and a single Filters
// (n) button. Below that a compact active-filter chip row. Nothing
// takes more than one row on a phone.
export function BrowseControls({
  query,
  sort,
  genres,
  groupedTags,
  genreSlugs,
  demographic,
  statuses,
  includeSlugs,
  excludeSlugs,
}: {
  query: string;
  sort: SearchSort;
  genres: GenreOption[];
  groupedTags: GroupedTags;
  genreSlugs: string[];
  demographic: string;
  statuses: NovelStatus[];
  includeSlugs: string[];
  excludeSlugs: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  const genreById = new Map(genres.map((g) => [g.slug, g]));
  const tagBySlug = new Map<string, string>();
  for (const t of groupedTags.top) tagBySlug.set(t.tag.slug, t.tag.name);
  for (const g of groupedTags.groups) for (const t of g.tags) tagBySlug.set(t.tag.slug, t.tag.name);
  const tagName = (slug: string) => tagBySlug.get(slug) ?? slug;

  const activeCount =
    genreSlugs.length +
    (demographic ? 1 : 0) +
    statuses.length +
    includeSlugs.length +
    excludeSlugs.length;

  const anyActive = activeCount > 0 || query.length > 0;

  function changeSort(next: SearchSort) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "trending") params.delete("sort");
    else params.set("sort", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  function removeParam(key: string, value?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) {
      params.delete(key);
    } else {
      const current = (params.get(key) ?? "").split(",").filter((v) => v && v !== value);
      if (current.length === 0) params.delete(key);
      else params.set(key, current.join(","));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  return (
    <div className="mb-6">
      {/* The single-row control strip: search + sort + Filters. */}
      <form className="flex flex-wrap items-center gap-2" action="/browse">
        {/* Preserve current filter params through a search submit. */}
        {[
          ["sort", sort === "trending" ? "" : sort],
          ["genre", genreSlugs.join(",")],
          ["demographic", demographic],
          ["status", statuses.join(",")],
          ["include", includeSlugs.join(",")],
          ["exclude", excludeSlugs.join(",")],
        ].map(([name, value]) =>
          value ? <input key={name} type="hidden" name={name} value={value} /> : null,
        )}
        <label className="flex flex-1 items-center gap-2 min-w-[180px] rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 focus-within:ring-2 focus-within:ring-[var(--brand)]/40">
          <span aria-hidden className="text-sm text-[var(--muted)]">
            ⌕
          </span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by title or author"
            aria-label="Search by title or author"
            className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--muted)]"
          />
        </label>

        <label className="text-xs text-[var(--muted)]">
          <span className="sr-only">Sort by</span>
          <select
            value={sort}
            onChange={(e) => changeSort(e.target.value as SearchSort)}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--foreground)]"
            aria-label="Sort results"
          >
            {SEARCH_SORTS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort · {opt.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={
            "rounded-full border px-4 py-2 text-xs font-semibold " +
            (activeCount > 0
              ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
              : "border-[var(--border)] bg-[var(--surface)] hover:text-[var(--foreground)]")
          }
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>

        <button
          type="submit"
          className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand-foreground)]"
        >
          Search
        </button>
      </form>

      {anyActive && (
        <div className="mt-3 space-y-2">
          {(genreSlugs.length > 0 || demographic || statuses.length > 0 || includeSlugs.length > 0) && (
            <ActiveGroup label="Required">
              {query && (
                <ActiveChip label={`“${query}”`} onRemove={() => removeParam("q")} />
              )}
              {genreSlugs.map((slug) => (
                <ActiveChip
                  key={`g-${slug}`}
                  label={genreById.get(slug)?.name ?? slug}
                  onRemove={() => removeParam("genre", slug)}
                />
              ))}
              {demographic && (
                <ActiveChip
                  label={DEMOGRAPHICS.find((d) => d.value === demographic)?.label ?? demographic}
                  onRemove={() => removeParam("demographic")}
                />
              )}
              {statuses.map((s) => (
                <ActiveChip
                  key={`s-${s}`}
                  label={s[0].toUpperCase() + s.slice(1)}
                  onRemove={() => removeParam("status", s)}
                />
              ))}
              {includeSlugs.map((slug) => (
                <ActiveChip
                  key={`i-${slug}`}
                  label={tagName(slug)}
                  onRemove={() => removeParam("include", slug)}
                />
              ))}
            </ActiveGroup>
          )}

          {excludeSlugs.length > 0 && (
            <ActiveGroup label="Excluded">
              {excludeSlugs.map((slug) => (
                <ActiveChip
                  key={`e-${slug}`}
                  label={tagName(slug)}
                  onRemove={() => removeParam("exclude", slug)}
                  variant="exclude"
                />
              ))}
            </ActiveGroup>
          )}

          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-[var(--muted)] underline hover:text-[var(--foreground)]"
          >
            Clear all
          </button>
        </div>
      )}

      <BrowseFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        genres={genres}
        groupedTags={groupedTags}
        initialGenreSlugs={genreSlugs}
        initialDemographic={demographic}
        initialStatuses={statuses}
        initialIncludeSlugs={includeSlugs}
        initialExcludeSlugs={excludeSlugs}
      />
    </div>
  );
}

function ActiveGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</span>
      {children}
    </div>
  );
}

function ActiveChip({
  label,
  onRemove,
  variant = "include",
}: {
  label: string;
  onRemove: () => void;
  variant?: "include" | "exclude";
}) {
  const style =
    variant === "include"
      ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
      : "border-red-600 bg-red-600/10 text-red-700 line-through dark:text-red-400";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="ml-1 text-current opacity-70 hover:opacity-100"
      >
        <span aria-hidden>×</span>
      </button>
    </span>
  );
}
