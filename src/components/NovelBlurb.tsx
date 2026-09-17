"use client";

import { useState } from "react";

// The novel's synopsis. Preserves the author's paragraph breaks; a long
// blurb collapses to a fixed height with a "Show more" button rather
// than being truncated silently. Short blurbs render as-is with no
// button — nothing to expand into.
const COLLAPSED_MAX_CH = 480;

export function NovelBlurb({ synopsis }: { synopsis: string }) {
  const text = synopsis?.trim() ?? "";
  const [expanded, setExpanded] = useState(false);

  if (!text) {
    return (
      <p className="text-sm italic text-[var(--muted)]">
        No blurb yet — the author hasn&apos;t written one.
      </p>
    );
  }

  const isLong = text.length > COLLAPSED_MAX_CH;
  const showFull = !isLong || expanded;

  return (
    <div>
      <div
        className={
          "whitespace-pre-line text-[15px] leading-relaxed text-[var(--foreground)] " +
          (showFull ? "" : "relative max-h-40 overflow-hidden")
        }
      >
        {text}
        {!showFull && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-[var(--background)]"
          />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 text-sm font-medium text-[var(--brand)] hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
