"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { saveReadingProgress } from "@/lib/actions/progress";
import { recordChapterRead } from "@/lib/actions/reads";
import type { Paragraph } from "@/lib/chapterContent";
import { EMPTY_COUNTS, type ReactionCountsShape } from "@/lib/reactions";
import type { ReactionType } from "@/lib/supabase/database.types";
import { ParagraphReactions } from "@/components/ParagraphReactions";
import { AuthorNote } from "@/components/ParagraphView";
import { CaughtUpCard } from "@/components/CaughtUpCard";
import type { NovelCardData, NovelStatus } from "@/lib/data/types";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  updateReaderSettings,
  type ReaderFontFamily,
  type ReaderSettings,
  type ReaderTheme,
} from "@/lib/readerSettingsStore";

type Theme = ReaderTheme;
type FontFamily = ReaderFontFamily;

interface ChapterNavItem {
  id: string;
  title: string;
  order_number: number;
}

export interface ChapterReactionData {
  countsByPid: Record<string, ReactionCountsShape>;
  myReactionsByPid: Record<string, ReactionType[]>;
  paragraphCommentCountsByPid: Record<string, number>;
}

export function ChapterReader({
  novelId,
  novelTitle,
  chapterId,
  chapterTitle,
  paragraphs,
  authorNoteTop,
  authorNoteBottom,
  prevChapter,
  nextChapter,
  tableOfContents,
  trackProgress,
  reactions,
  isLoggedIn,
  chapterCommentCount,
  isNewestChapter,
  novelStatus,
  suggestions,
  preview,
}: {
  novelId: string;
  novelTitle: string;
  chapterId: string;
  chapterTitle: string;
  paragraphs: Paragraph[];
  authorNoteTop: string | null;
  authorNoteBottom: string | null;
  prevChapter: ChapterNavItem | null;
  nextChapter: ChapterNavItem | null;
  tableOfContents: ChapterNavItem[];
  trackProgress: boolean;
  reactions: ChapterReactionData;
  isLoggedIn: boolean;
  chapterCommentCount: number;
  isNewestChapter: boolean;
  novelStatus: NovelStatus;
  suggestions: NovelCardData[];
  preview: boolean;
}) {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    if (preview) {
      // Preview mode: no reading progress, no read recording. This is
      // an author looking at their own draft.
      window.scrollTo(0, 0);
      return;
    }
    if (trackProgress) {
      saveReadingProgress(novelId, chapterId).catch(() => {});
    }
    // Fire-and-forget: never block the reader. The action handles auth,
    // the "not the novel's own author" rule, and the per-day dedup itself.
    recordChapterRead(novelId, chapterId).catch(() => {});
    window.scrollTo(0, 0);
  }, [novelId, chapterId, trackProgress, preview]);

  function update<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) {
    updateReaderSettings({ [key]: value });
  }

  return (
    <div className={`reader-surface reader-${settings.theme} min-h-screen`}>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link href={`/novels/${novelId}`} className="opacity-80 hover:opacity-100">
            &larr; {novelTitle}
          </Link>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setTocOpen((v) => !v)}
              className="rounded-full border border-current px-3 py-1 opacity-80 hover:opacity-100"
            >
              Contents
            </button>
            <Link
              href={`/novels/${novelId}/chapters/${chapterId}/comments`}
              className="rounded-full border border-current px-3 py-1 opacity-80 hover:opacity-100"
            >
              Comments{chapterCommentCount > 0 ? ` (${chapterCommentCount})` : ""}
            </Link>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className="rounded-full border border-current px-3 py-1 opacity-80 hover:opacity-100"
            >
              Aa Settings
            </button>
          </div>
        </div>

        {tocOpen && (
          <ol className="mb-6 max-h-64 overflow-y-auto rounded-lg border border-current/20 text-sm">
            {tableOfContents.map((c) => (
              <li key={c.id} className="border-b border-current/10 last:border-0">
                <Link
                  href={`/novels/${novelId}/chapters/${c.id}`}
                  className={`block px-3 py-2 hover:bg-current/5 ${c.id === chapterId ? "font-semibold" : ""}`}
                >
                  {c.order_number}. {c.title}
                </Link>
              </li>
            ))}
          </ol>
        )}

        {settingsOpen && (
          <div className="mb-6 space-y-4 rounded-lg border border-current/20 p-4 text-sm">
            <div>
              <span className="mb-1 block font-medium">Theme</span>
              <div className="flex gap-2">
                {(["light", "dark", "sepia"] as Theme[]).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => update("theme", theme)}
                    className={`rounded-full border border-current px-3 py-1 capitalize ${
                      settings.theme === theme ? "bg-current/10" : ""
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1 block font-medium">Font</span>
              <div className="flex gap-2">
                {(["serif", "sans"] as FontFamily[]).map((font) => (
                  <button
                    key={font}
                    type="button"
                    onClick={() => update("fontFamily", font)}
                    className={`rounded-full border border-current px-3 py-1 capitalize ${
                      settings.fontFamily === font ? "bg-current/10" : ""
                    }`}
                  >
                    {font}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block font-medium">Font size ({settings.fontSize}px)</span>
              <input
                type="range"
                min={14}
                max={26}
                step={1}
                value={settings.fontSize}
                onChange={(e) => update("fontSize", Number(e.target.value))}
                className="w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-medium">Line height ({settings.lineHeight.toFixed(1)})</span>
              <input
                type="range"
                min={1.3}
                max={2.4}
                step={0.1}
                value={settings.lineHeight}
                onChange={(e) => update("lineHeight", Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>
        )}

        <h1 className="mb-6 text-xl font-semibold">{chapterTitle}</h1>

        {preview && (
          <p className="mb-4 rounded-lg border border-dashed border-current/30 px-3 py-2 text-xs opacity-80">
            Preview mode — this is exactly what a reader sees. Nothing is being published, and this
            view doesn&apos;t count as a read.
          </p>
        )}

        <AuthorNote position="top" text={authorNoteTop} />

        <div
          className={settings.fontFamily === "serif" ? "font-serif" : "font-sans"}
          style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}
        >
          {paragraphs.map((p) => (
            <ParagraphReactions
              key={p.pid}
              novelId={novelId}
              chapterId={chapterId}
              paragraph={p}
              initialCounts={reactions.countsByPid[p.pid] ?? EMPTY_COUNTS}
              initialMyReactions={reactions.myReactionsByPid[p.pid] ?? []}
              initialCommentCount={reactions.paragraphCommentCountsByPid[p.pid] ?? 0}
              isLoggedIn={isLoggedIn}
              interactive={!preview}
            />
          ))}
        </div>

        <AuthorNote position="bottom" text={authorNoteBottom} />

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-current/20 pt-6 text-sm">
          {prevChapter ? (
            <Link href={`/novels/${novelId}/chapters/${prevChapter.id}`} className="hover:underline">
              &larr; Previous chapter
            </Link>
          ) : (
            <span />
          )}
          <Link
            href={`/novels/${novelId}/chapters/${chapterId}/comments`}
            className="rounded-full border border-current px-4 py-1.5 font-medium hover:opacity-90"
          >
            {chapterCommentCount > 0 ? `${chapterCommentCount} chapter comments` : "Leave a chapter comment"}
          </Link>
          {/* Never both a next-chapter button AND a caught-up card. */}
          {nextChapter ? (
            <Link href={`/novels/${novelId}/chapters/${nextChapter.id}`} className="hover:underline">
              Next chapter &rarr;
            </Link>
          ) : (
            <span />
          )}
        </div>

        {isNewestChapter && !nextChapter && (
          <CaughtUpCard novelStatus={novelStatus} suggestions={suggestions} />
        )}
      </div>
    </div>
  );
}
