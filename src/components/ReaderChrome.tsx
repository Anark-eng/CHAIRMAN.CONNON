"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  DEFAULT_READER_SETTINGS,
  updateReaderSettings,
  type ReaderFontFamily,
  type ReaderSettings,
  type ReaderWidth,
} from "@/lib/readerSettingsStore";

export interface ReaderChapterNavItem {
  id: string;
  title: string;
  order_number: number;
  volume_id?: string | null;
}

export interface ReaderVolume {
  id: string;
  name: string;
  position: number;
}

// ---------------------------------------------------------------------------
// Top bar
//
// Sticky, quiet, and small. Left column: back to novel + novel title
// (elided on very small phones). Right column: three round icon
// buttons — Contents, Comments, Aa settings. All targets meet the 44px
// minimum via .reader-hit.
// ---------------------------------------------------------------------------
export function ReaderTopBar({
  novelId,
  novelTitle,
  chapterId,
  chapterCommentCount,
  onOpenContents,
  onOpenSettings,
}: {
  novelId: string;
  novelTitle: string;
  chapterId: string;
  chapterCommentCount: number;
  onOpenContents: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-current/10 bg-[var(--reader-bg)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
        <Link
          href={`/novels/${novelId}`}
          className="reader-hit flex min-w-0 flex-1 items-center gap-2 rounded-full pr-3 text-sm hover:bg-current/5"
          aria-label={`Back to ${novelTitle}`}
        >
          <span aria-hidden className="pl-2 text-lg leading-none">
            ‹
          </span>
          <span className="truncate opacity-80">{novelTitle}</span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Reader controls">
          <button
            type="button"
            onClick={onOpenContents}
            className="reader-hit inline-flex items-center justify-center rounded-full hover:bg-current/10"
            aria-label="Table of contents"
            title="Contents"
          >
            <ListIcon />
          </button>
          <Link
            href={`/novels/${novelId}/chapters/${chapterId}/comments`}
            className="reader-hit inline-flex items-center justify-center rounded-full hover:bg-current/10"
            aria-label={
              chapterCommentCount > 0
                ? `Chapter comments (${chapterCommentCount})`
                : "Chapter comments"
            }
            title={chapterCommentCount > 0 ? `${chapterCommentCount} comments` : "Comments"}
          >
            <CommentIcon />
            {chapterCommentCount > 0 && (
              <span
                aria-hidden
                className="ml-0.5 -mr-1 inline-block rounded-full bg-current/15 px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums"
              >
                {chapterCommentCount > 99 ? "99+" : chapterCommentCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={onOpenSettings}
            className="reader-hit inline-flex items-center justify-center rounded-full hover:bg-current/10"
            aria-label="Reading settings"
            title="Aa"
          >
            <span aria-hidden className="text-[15px] font-semibold tracking-tight">
              Aa
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
}

function ListIcon() {
  return (
    <svg
      aria-hidden
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      aria-hidden
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12c0 4.5-4 8-9 8a10.6 10.6 0 0 1-4-.75L3 21l1.5-4.5A7.6 7.6 0 0 1 3 12c0-4.5 4-8 9-8s9 3.5 9 8Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Reading settings panel
//
// Theme (light / sepia / dark), reading width (narrow / comfortable /
// wide), font (serif / sans), font size (–/+ around a numeric value),
// line height (–/+ around a numeric value). A "Reset to defaults"
// footer button gets everything back to sensible baselines in one tap.
// ---------------------------------------------------------------------------
export function ReaderSettingsPanel({ settings }: { settings: ReaderSettings }) {
  function update<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) {
    updateReaderSettings({ [key]: value });
  }

  return (
    <div className="space-y-6">
      <Row label="Theme">
        <SegmentedChoice
          value={settings.theme}
          onChange={(v) => update("theme", v)}
          options={[
            { value: "light", label: "Light" },
            { value: "sepia", label: "Sepia" },
            { value: "dark", label: "Dark" },
          ]}
          ariaLabel="Reader theme"
        />
      </Row>

      <Row label="Reading width">
        <SegmentedChoice<ReaderWidth>
          value={settings.width}
          onChange={(v) => update("width", v)}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "comfortable", label: "Comfortable" },
            { value: "wide", label: "Wide" },
          ]}
          ariaLabel="Reading column width"
        />
      </Row>

      <Row label="Font">
        <SegmentedChoice<ReaderFontFamily>
          value={settings.fontFamily}
          onChange={(v) => update("fontFamily", v)}
          options={[
            { value: "serif", label: "Serif" },
            { value: "sans", label: "Sans" },
          ]}
          ariaLabel="Font family"
        />
      </Row>

      <Row label={`Font size — ${settings.fontSize}px`}>
        <Stepper
          value={settings.fontSize}
          min={14}
          max={28}
          step={1}
          suffix="px"
          onChange={(v) => update("fontSize", v)}
          ariaLabel="Font size"
        />
      </Row>

      <Row label={`Line spacing — ${settings.lineHeight.toFixed(2)}`}>
        <Stepper
          value={settings.lineHeight}
          min={1.3}
          max={2.4}
          step={0.1}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update("lineHeight", Number(v.toFixed(2)))}
          ariaLabel="Line spacing"
        />
      </Row>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => updateReaderSettings(DEFAULT_READER_SETTINGS)}
          className="text-xs underline opacity-70 hover:opacity-100"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      {children}
    </div>
  );
}

interface Option<T extends string> {
  value: T;
  label: string;
}

function SegmentedChoice<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid gap-1 rounded-full border border-current/20 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={
              "reader-hit rounded-full px-3 text-sm font-medium transition-colors " +
              (active
                ? "bg-current text-[var(--reader-bg)]"
                : "hover:bg-current/10")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  step,
  suffix,
  format,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  const display = format ? format(value) : `${value}${suffix ?? ""}`;
  const canDown = value - step >= min - 1e-6;
  const canUp = value + step <= max + 1e-6;
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => canDown && onChange(clamp(value - step, min, max))}
        disabled={!canDown}
        aria-label={`${ariaLabel} smaller`}
        className="reader-hit rounded-full border border-current/30 px-3 text-lg font-semibold leading-none disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-[4ch] text-center text-sm font-medium tabular-nums">{display}</span>
      <button
        type="button"
        onClick={() => canUp && onChange(clamp(value + step, min, max))}
        disabled={!canUp}
        aria-label={`${ariaLabel} larger`}
        className="reader-hit rounded-full border border-current/30 px-3 text-lg font-semibold leading-none disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

// ---------------------------------------------------------------------------
// Contents panel
//
// Groups chapters by volume when the novel has any; otherwise a flat
// list. The current chapter is highlighted in the current colour and
// scrolled into view when the sheet opens.
// ---------------------------------------------------------------------------
export function ContentsPanel({
  novelId,
  chapters,
  volumes,
  currentChapterId,
}: {
  novelId: string;
  chapters: ReaderChapterNavItem[];
  volumes: ReaderVolume[];
  currentChapterId: string;
}) {
  const grouped = useMemo(() => groupChaptersByVolume(chapters, volumes), [chapters, volumes]);

  return (
    <div className="space-y-6 text-sm">
      {grouped.map((group) => (
        <section key={group.key}>
          {group.name && (
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
              {group.name}
            </h3>
          )}
          <ol className="divide-y divide-current/10 rounded-lg border border-current/10">
            {group.chapters.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/novels/${novelId}/chapters/${c.id}`}
                  className={
                    "flex items-baseline gap-2 px-3 py-2 hover:bg-current/5 " +
                    (c.id === currentChapterId ? "font-semibold text-[var(--reader-fg)]" : "opacity-90")
                  }
                  aria-current={c.id === currentChapterId ? "true" : undefined}
                >
                  <span className="w-8 shrink-0 text-right text-xs opacity-60 tabular-nums">
                    {c.order_number}
                  </span>
                  <span className="truncate">{c.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

interface Group {
  key: string;
  name: string | null;
  chapters: ReaderChapterNavItem[];
}

function groupChaptersByVolume(chapters: ReaderChapterNavItem[], volumes: ReaderVolume[]): Group[] {
  const ordered = [...chapters].sort((a, b) => a.order_number - b.order_number);
  if (volumes.length === 0) return [{ key: "flat", name: null, chapters: ordered }];
  const byVol = new Map<string, ReaderChapterNavItem[]>();
  for (const c of ordered) {
    const key = c.volume_id ?? "__none__";
    const arr = byVol.get(key) ?? [];
    arr.push(c);
    byVol.set(key, arr);
  }
  const groups: Group[] = [];
  for (const v of [...volumes].sort((a, b) => a.position - b.position)) {
    const arr = byVol.get(v.id) ?? [];
    if (arr.length > 0) groups.push({ key: v.id, name: v.name, chapters: arr });
  }
  const unvol = byVol.get("__none__") ?? [];
  if (unvol.length > 0) groups.push({ key: "__none__", name: "Other chapters", chapters: unvol });
  return groups;
}

// ---------------------------------------------------------------------------
// End-of-chapter action strip
//
// Reader-facing: previous / next chapter, back to novel, jump to
// comments, and small progress information ("Chapter X of Y"). On the
// newest chapter the CaughtUpCard renders this strip inside itself so
// nothing stacks.
// ---------------------------------------------------------------------------
export function EndOfChapterActions({
  novelId,
  novelTitle,
  chapterId,
  prevChapter,
  nextChapter,
  positionLabel,
  chapterCommentCount,
  compact,
}: {
  novelId: string;
  novelTitle: string;
  chapterId: string;
  prevChapter: ReaderChapterNavItem | null;
  nextChapter: ReaderChapterNavItem | null;
  positionLabel: string;
  chapterCommentCount: number;
  compact?: boolean;
}) {
  return (
    <nav
      aria-label="End of chapter actions"
      className={compact ? "space-y-3" : "mt-10 space-y-3 border-t border-current/15 pt-6"}
    >
      <p className="text-xs opacity-70">{positionLabel}</p>
      <div className="flex flex-wrap gap-2">
        {prevChapter ? (
          <Link
            href={`/novels/${novelId}/chapters/${prevChapter.id}`}
            className="reader-hit inline-flex items-center gap-1 rounded-full border border-current/30 px-4 text-sm font-medium hover:bg-current/5"
          >
            <span aria-hidden>←</span> Previous
          </Link>
        ) : (
          <span
            aria-disabled
            className="reader-hit inline-flex items-center gap-1 rounded-full border border-current/15 px-4 text-sm opacity-60"
            title="You're at the first chapter."
          >
            <span aria-hidden>←</span> First chapter
          </span>
        )}
        {nextChapter ? (
          <Link
            href={`/novels/${novelId}/chapters/${nextChapter.id}`}
            className="reader-hit inline-flex items-center gap-1 rounded-full bg-[var(--reader-fg)] px-4 text-sm font-medium text-[var(--reader-bg)]"
          >
            Next <span aria-hidden>→</span>
          </Link>
        ) : null}
        <Link
          href={`/novels/${novelId}`}
          className="reader-hit inline-flex items-center rounded-full border border-current/30 px-4 text-sm font-medium hover:bg-current/5"
        >
          Back to {ellipsize(novelTitle, 24)}
        </Link>
        <Link
          href={`/novels/${novelId}/chapters/${chapterId}/comments`}
          className="reader-hit inline-flex items-center rounded-full border border-current/30 px-4 text-sm font-medium hover:bg-current/5"
        >
          {chapterCommentCount > 0
            ? `Comments (${chapterCommentCount})`
            : "Leave a comment"}
        </Link>
      </div>
    </nav>
  );
}

function ellipsize(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
