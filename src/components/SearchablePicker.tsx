"use client";

import { useMemo, useState } from "react";

export interface PickerItem {
  id: string;
  name: string;
}

// Reusable searchable multi-select. Renders as:
//   - a row of chips for the current selection, each with a × to remove
//   - a search box that filters the pool and shows matching items
//   - optional "extra" render slot below the search (used by the tag
//     picker to offer "Create new tag: X")
//
// Selection is passed in and out via the `selected` + `onChange` props
// so the parent form owns the truth. This component doesn't call any
// server actions on its own.
export function SearchablePicker({
  pool,
  selected,
  onChange,
  placeholder = "Search…",
  emptyLabel = "No matches.",
  max,
  maxHelper,
  extra,
}: {
  pool: PickerItem[];
  selected: PickerItem[];
  onChange: (next: PickerItem[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  max?: number;
  maxHelper?: string; // e.g. "up to 9 genres"
  extra?: (query: string, matches: PickerItem[]) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const atCap = max !== undefined && selected.length >= max;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = pool.filter((p) => !selectedIds.has(p.id));
    if (!q) return base.slice(0, 12);
    return base.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [pool, selectedIds, query]);

  function add(item: PickerItem) {
    if (atCap) return;
    if (selectedIds.has(item.id)) return;
    onChange([...selected, item]);
    setQuery("");
  }
  function remove(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[var(--brand-foreground)]"
              >
                <span>{item.name}</span>
                <span aria-hidden className="opacity-80">
                  &times;
                </span>
                <span className="sr-only">Remove {item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={atCap ? maxHelper ?? placeholder : placeholder}
        disabled={atCap}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm disabled:opacity-60"
      />

      {atCap && maxHelper && <p className="text-xs text-[var(--muted)]">{maxHelper}</p>}

      {!atCap && (
        <>
          {matches.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {matches.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => add(item)}
                    className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            query.trim().length > 0 && (
              <p className="text-xs text-[var(--muted)]">{emptyLabel}</p>
            )
          )}
          {extra?.(query, matches)}
        </>
      )}
    </div>
  );
}
