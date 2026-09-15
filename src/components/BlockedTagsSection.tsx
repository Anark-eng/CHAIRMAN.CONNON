"use client";

import { useState, useTransition } from "react";
import { toggleBlockedTag } from "@/lib/actions/blockedTags";
import type { TagOption } from "@/lib/data/types";

export function BlockedTagsSection({
  allTags,
  initialBlockedIds,
}: {
  allTags: TagOption[];
  initialBlockedIds: string[];
}) {
  const [blocked, setBlocked] = useState<Set<string>>(new Set(initialBlockedIds));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(tagId: string) {
    const isBlocked = blocked.has(tagId);
    const next = new Set(blocked);
    if (isBlocked) next.delete(tagId);
    else next.add(tagId);
    setBlocked(next);
    setPendingId(tagId);
    startTransition(async () => {
      try {
        await toggleBlockedTag(tagId, !isBlocked);
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <section className="mt-10 border-t border-[var(--border)] pt-8">
      <h2 className="mb-1 text-lg font-semibold">Blocked tags</h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Novels tagged with anything you block are filtered out of every list — home, trending,
        browse, and search. Opening a blocked novel&apos;s page directly still works.
      </p>
      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => {
          const isBlocked = blocked.has(tag.id);
          const isPending = pendingId === tag.id;
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              disabled={isPending}
              aria-pressed={isBlocked}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (isBlocked
                  ? "border-red-600 bg-red-600/10 text-red-700 line-through dark:text-red-400"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]") +
                (isPending ? " opacity-60" : "")
              }
            >
              {tag.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
