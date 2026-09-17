"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ChapterSummary } from "@/lib/data/types";

interface Volume {
  id: string;
  name: string;
  position: number;
}

// Reader-facing chapter list. Groups by volume when the novel has
// them; otherwise a flat, ascending-order list.
//
// Long novels paginate at PAGE_SIZE to keep initial paint quick.
// Progress derives from the reader's last-read chapter's order_number
// (the single source of truth per CLAUDE.md — everything up to and
// including that order is "read"; everything above is "unread").
const PAGE_SIZE = 50;

export function ReaderChapterList({
  novelId,
  chapters,
  volumes,
  lastReadOrder,
  currentChapterId,
}: {
  novelId: string;
  chapters: ChapterSummary[];
  volumes: Volume[];
  lastReadOrder: number | null;
  currentChapterId: string | null;
}) {
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...chapters].sort((a, b) => a.order_number - b.order_number);
    return order === "asc" ? arr : arr.reverse();
  }, [chapters, order]);

  const hasVolumes = volumes.length > 0;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginate = !hasVolumes && sorted.length > PAGE_SIZE;
  const visible = paginate
    ? sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
    : sorted;

  const groups = useMemo(() => {
    if (!hasVolumes) return [{ key: "flat", name: null, chapters: visible }];
    return groupByVolume(visible, volumes, order);
  }, [visible, volumes, hasVolumes, order]);

  return (
    <section aria-label="Chapters">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">
          {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium hover:bg-[var(--surface)]"
          aria-label={`Sort chapters ${order === "asc" ? "newest first" : "oldest first"}`}
        >
          {order === "asc" ? "Oldest first ↑" : "Newest first ↓"}
        </button>
      </div>

      {chapters.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          No chapters published yet.
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key}>
              {group.name && (
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {group.name}
                </h3>
              )}
              <ol className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                {group.chapters.map((c) => (
                  <ReaderChapterRow
                    key={c.id}
                    novelId={novelId}
                    chapter={c}
                    isRead={lastReadOrder !== null && c.order_number <= lastReadOrder}
                    isCurrent={c.id === currentChapterId}
                  />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {paginate && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-full border border-[var(--border)] px-3 py-1 disabled:opacity-40"
          >
            ← Newer
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-full border border-[var(--border)] px-3 py-1 disabled:opacity-40"
          >
            Older →
          </button>
        </div>
      )}
    </section>
  );
}

function ReaderChapterRow({
  novelId,
  chapter,
  isRead,
  isCurrent,
}: {
  novelId: string;
  chapter: ChapterSummary;
  isRead: boolean;
  isCurrent: boolean;
}) {
  const stateLabel = isCurrent ? "Continue here" : isRead ? "Read" : "Unread";
  const published = chapter.published_at ? new Date(chapter.published_at) : null;

  return (
    <li>
      <Link
        href={`/novels/${novelId}/chapters/${chapter.id}`}
        className={
          "flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--background)] " +
          (isCurrent ? "bg-[var(--background)]" : "")
        }
        aria-current={isCurrent ? "true" : undefined}
      >
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--muted)]">
          {chapter.order_number}
        </span>
        <span
          aria-hidden
          className={
            "inline-block h-2 w-2 shrink-0 rounded-full " +
            (isCurrent
              ? "bg-[var(--brand)]"
              : isRead
                ? "bg-[var(--muted)]"
                : "border border-[var(--border)]")
          }
        />
        <span
          className={
            "min-w-0 flex-1 truncate " +
            (isRead && !isCurrent ? "text-[var(--muted)]" : "text-[var(--foreground)]")
          }
        >
          {chapter.title}
        </span>
        <span className="hidden sm:inline text-xs text-[var(--muted)]">
          {published ? relativeDate(published) : ""}
        </span>
        <span className="sr-only">{stateLabel}</span>
      </Link>
    </li>
  );
}

function relativeDate(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

interface Group {
  key: string;
  name: string | null;
  chapters: ChapterSummary[];
}

function groupByVolume(chapters: ChapterSummary[], volumes: Volume[], order: "asc" | "desc"): Group[] {
  const byVolume = new Map<string, ChapterSummary[]>();
  for (const c of chapters) {
    const key = c.volume_id ?? "__none__";
    const arr = byVolume.get(key) ?? [];
    arr.push(c);
    byVolume.set(key, arr);
  }
  const orderedVolumes = [...volumes].sort((a, b) =>
    order === "asc" ? a.position - b.position : b.position - a.position,
  );
  const groups: Group[] = [];
  for (const v of orderedVolumes) {
    const arr = byVolume.get(v.id) ?? [];
    if (arr.length > 0) groups.push({ key: v.id, name: v.name, chapters: arr });
  }
  const unvol = byVolume.get("__none__") ?? [];
  if (unvol.length > 0) groups.push({ key: "__none__", name: "Other chapters", chapters: unvol });
  return groups;
}
