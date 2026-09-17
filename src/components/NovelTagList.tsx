"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TagOption } from "@/lib/data/types";

// A content-warning tag is identified by its slug prefix — that's the
// naming convention the seeded warning tags use in migration 0007
// ("CW: Violence" → "cw-violence"). These tags are the ones a reader
// most needs to see before starting, so we always render them up
// front, never behind Show more.
export function isContentWarningTag(tag: TagOption): boolean {
  return tag.slug.startsWith("cw-");
}

const VISIBLE_BEFORE_SHOW_MORE = 8;

export function NovelTagList({ tags }: { tags: TagOption[] }) {
  const [expanded, setExpanded] = useState(false);

  const { warnings, others } = useMemo(() => {
    const warnings: TagOption[] = [];
    const others: TagOption[] = [];
    for (const t of tags) {
      if (isContentWarningTag(t)) warnings.push(t);
      else others.push(t);
    }
    return { warnings, others };
  }, [tags]);

  if (tags.length === 0) return null;

  const remainingBudget = Math.max(0, VISIBLE_BEFORE_SHOW_MORE - warnings.length);
  const visibleOthers = expanded ? others : others.slice(0, remainingBudget);
  const hiddenCount = others.length - visibleOthers.length;

  return (
    <div>
      {warnings.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Content warnings">
          {warnings.map((tag) => (
            <TagChip key={tag.id} tag={tag} variant="warning" />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleOthers.map((tag) => (
            <TagChip key={tag.id} tag={tag} variant="normal" />
          ))}
          {hiddenCount > 0 && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              +{hiddenCount} more
            </button>
          )}
          {expanded && others.length > VISIBLE_BEFORE_SHOW_MORE - warnings.length && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Show fewer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Approved tags link into Browse's tag filter. Unapproved tags don't:
// Browse's filter list only shows approved tags, so a link to an
// unapproved slug wouldn't return anything sensible.
function TagChip({ tag, variant }: { tag: TagOption; variant: "warning" | "normal" }) {
  const approved = tag.is_approved !== false;
  const base = "rounded-full px-2.5 py-0.5 text-xs";
  const style =
    variant === "warning"
      ? "border border-amber-500/40 bg-amber-500/10 font-medium text-amber-800 dark:text-amber-200"
      : "bg-[var(--border)] text-[var(--foreground)]";

  if (approved) {
    return (
      <Link
        href={`/browse?include=${encodeURIComponent(tag.slug)}`}
        className={`${base} ${style} hover:underline`}
      >
        {tag.name}
      </Link>
    );
  }
  return (
    <span className={`${base} ${style} opacity-80`} title="Not yet in Browse filters">
      {tag.name}
    </span>
  );
}
