"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createVolume, moveChapterToVolume, reorderChapters } from "@/lib/actions/chapters";
import type { ChapterSummary } from "@/lib/data/types";

interface Volume {
  id: string;
  name: string;
  position: number;
}

interface ChapterListForAuthorProps {
  novelId: string;
  chapters: ChapterSummary[];
  volumes: Volume[];
  isOwner: boolean;
}

// A single reusable list of a novel's chapters:
//   - readers see the flat published list (or grouped by volume if the
//     novel has any).
//   - the novel's author sees drafts + scheduled chapters, with
//     up/down reorder controls and a per-chapter "move to volume"
//     picker, plus a "New volume" button.
export function ChapterListForAuthor({ novelId, chapters, volumes, isOwner }: ChapterListForAuthorProps) {
  const [items, setItems] = useState<ChapterSummary[]>(chapters);
  const [vols, setVols] = useState<Volume[]>(volumes);
  const [savingReorder, startReorder] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newVolumeName, setNewVolumeName] = useState("");
  const [creatingVolume, startCreatingVolume] = useTransition();

  const groups = useMemo(() => groupByVolume(items, vols, isOwner), [items, vols, isOwner]);

  function move(chapterId: string, direction: -1 | 1) {
    const idx = items.findIndex((c) => c.id === chapterId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= items.length) return;
    const next = items.slice();
    const [x] = next.splice(idx, 1);
    next.splice(target, 0, x);
    // Renumber immediately for optimistic feedback.
    const renumbered = next.map((c, i) => ({ ...c, order_number: i + 1 }));
    setItems(renumbered);
    setError(null);
    startReorder(async () => {
      const result = await reorderChapters(
        novelId,
        renumbered.map((c) => c.id),
      );
      if (!result.ok) {
        setError(result.error ?? "Reorder failed.");
        setItems(items); // roll back
      }
    });
  }

  function setVolume(chapterId: string, volumeId: string) {
    const next = items.map((c) => (c.id === chapterId ? { ...c, volume_id: volumeId || null } : c));
    setItems(next);
    startReorder(async () => {
      await moveChapterToVolume(novelId, chapterId, volumeId || null);
    });
  }

  function handleCreateVolume() {
    const name = newVolumeName.trim();
    if (!name) return;
    startCreatingVolume(async () => {
      const result = await createVolume(novelId, name);
      if (result.ok) {
        // The server revalidates; but for the current session we can
        // stub in a locally-visible entry so the select shows it right
        // away. It'll refresh next navigation.
        setVols((prev) => [
          ...prev,
          { id: `local-${Date.now()}`, name, position: prev.length + 1 },
        ]);
        setNewVolumeName("");
      } else {
        setError(result.error ?? "Could not create volume.");
      }
    });
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Chapters</h2>
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newVolumeName}
              onChange={(e) => setNewVolumeName(e.target.value)}
              placeholder="New volume name"
              className="w-40 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={handleCreateVolume}
              disabled={creatingVolume || !newVolumeName.trim()}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs disabled:opacity-50"
            >
              Create volume
            </button>
            <Link
              href={`/novels/${novelId}/chapters/new`}
              className="rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[var(--brand-foreground)]"
            >
              New chapter
            </Link>
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {savingReorder && <p className="mb-2 text-xs text-[var(--muted)]">Saving order…</p>}

      {items.length === 0 ? (
        <p className="text-[var(--muted)]">No chapters yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key}>
              {group.name && (
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {group.name}
                </h3>
              )}
              <ol className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                {group.chapters.map((chapter) => (
                  <ChapterRow
                    key={chapter.id}
                    novelId={novelId}
                    chapter={chapter}
                    isOwner={isOwner}
                    volumes={vols}
                    onMove={move}
                    onSetVolume={setVolume}
                  />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ChapterRow({
  novelId,
  chapter,
  isOwner,
  volumes,
  onMove,
  onSetVolume,
}: {
  novelId: string;
  chapter: ChapterSummary;
  isOwner: boolean;
  volumes: Volume[];
  onMove: (id: string, direction: -1 | 1) => void;
  onSetVolume: (id: string, volumeId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          href={`/novels/${novelId}/chapters/${chapter.id}`}
          className="truncate hover:text-[var(--brand)]"
        >
          {chapter.order_number}. {chapter.title}
        </Link>
        {!chapter.is_published && !chapter.publish_at && (
          <span className="text-xs font-medium text-amber-600">Draft</span>
        )}
        {!chapter.is_published && chapter.publish_at && (
          <span className="text-xs font-medium text-[var(--brand)]">
            Scheduled — {new Date(chapter.publish_at).toLocaleString()}
          </span>
        )}
      </div>

      {isOwner && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          {volumes.length > 0 && (
            <select
              value={chapter.volume_id ?? ""}
              onChange={(e) => onSetVolume(chapter.id, e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5"
            >
              <option value="">No volume</option>
              {volumes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => onMove(chapter.id, -1)}
            aria-label="Move up"
            className="rounded border border-[var(--border)] px-2 py-0.5"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(chapter.id, 1)}
            aria-label="Move down"
            className="rounded border border-[var(--border)] px-2 py-0.5"
          >
            ↓
          </button>
          <Link href={`/novels/${novelId}/chapters/${chapter.id}/edit`} className="hover:text-[var(--foreground)]">
            Edit
          </Link>
        </div>
      )}
    </li>
  );
}

interface Group {
  key: string;
  name: string | null;
  chapters: ChapterSummary[];
}

function groupByVolume(chapters: ChapterSummary[], volumes: Volume[], isOwner: boolean): Group[] {
  if (volumes.length === 0) {
    return [{ key: "flat", name: null, chapters: [...chapters].sort((a, b) => a.order_number - b.order_number) }];
  }

  const byVolume = new Map<string, ChapterSummary[]>();
  for (const c of chapters) {
    const key = c.volume_id ?? "__none__";
    const arr = byVolume.get(key) ?? [];
    arr.push(c);
    byVolume.set(key, arr);
  }
  for (const arr of byVolume.values()) arr.sort((a, b) => a.order_number - b.order_number);

  const groups: Group[] = [];
  for (const v of [...volumes].sort((a, b) => a.position - b.position)) {
    const arr = byVolume.get(v.id) ?? [];
    if (arr.length > 0 || isOwner) {
      groups.push({ key: v.id, name: v.name, chapters: arr });
    }
  }
  const unvol = byVolume.get("__none__") ?? [];
  if (unvol.length > 0) {
    groups.push({ key: "__none__", name: isOwner ? "No volume" : null, chapters: unvol });
  }
  return groups;
}
