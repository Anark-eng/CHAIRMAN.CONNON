"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { saveReadingProgress } from "@/lib/actions/progress";
import { recordChapterRead } from "@/lib/actions/reads";
import type { Paragraph } from "@/lib/chapterContent";
import { EMPTY_COUNTS, type ReactionCountsShape } from "@/lib/reactions";
import type { ReactionType } from "@/lib/supabase/database.types";
import { ParagraphReactions } from "@/components/ParagraphReactions";
import { AuthorNote } from "@/components/ParagraphView";
import { CaughtUpCard } from "@/components/CaughtUpCard";
import { ReaderSheet } from "@/components/ReaderSheet";
import {
  ContentsPanel,
  EndOfChapterActions,
  ReaderSettingsPanel,
  ReaderTopBar,
  type ReaderChapterNavItem,
  type ReaderVolume,
} from "@/components/ReaderChrome";
import type { NovelCardData, NovelStatus } from "@/lib/data/types";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
} from "@/lib/readerSettingsStore";

const WIDTH_CLASS: Record<"narrow" | "comfortable" | "wide", string> = {
  narrow: "reader-col-narrow",
  comfortable: "reader-col-comfortable",
  wide: "reader-col-wide",
};

export interface ChapterReactionData {
  countsByPid: Record<string, ReactionCountsShape>;
  myReactionsByPid: Record<string, ReactionType[]>;
  paragraphCommentCountsByPid: Record<string, number>;
}

export function ChapterReader({
  novelId,
  novelTitle,
  authorPenName,
  chapterId,
  chapterTitle,
  chapterNumber,
  paragraphs,
  authorNoteTop,
  authorNoteBottom,
  prevChapter,
  nextChapter,
  tableOfContents,
  volumes,
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
  authorPenName: string | null;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  paragraphs: Paragraph[];
  authorNoteTop: string | null;
  authorNoteBottom: string | null;
  prevChapter: ReaderChapterNavItem | null;
  nextChapter: ReaderChapterNavItem | null;
  tableOfContents: ReaderChapterNavItem[];
  volumes: ReaderVolume[];
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

  const widthClass = WIDTH_CLASS[settings.width] ?? WIDTH_CLASS.comfortable;
  const chapterPosition = `Chapter ${chapterNumber} of ${tableOfContents.length}`;

  const endActions = (
    <EndOfChapterActions
      novelId={novelId}
      novelTitle={novelTitle}
      chapterId={chapterId}
      prevChapter={prevChapter}
      nextChapter={nextChapter}
      positionLabel={chapterPosition}
      chapterCommentCount={chapterCommentCount}
      compact={isNewestChapter}
    />
  );

  return (
    <div className={`reader-surface reader-${settings.theme} min-h-screen`}>
      <ReaderTopBar
        novelId={novelId}
        novelTitle={novelTitle}
        chapterId={chapterId}
        chapterCommentCount={chapterCommentCount}
        onOpenContents={() => setTocOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <article className={`mx-auto ${widthClass} px-5 py-8 sm:px-6 sm:py-12`}>
        <header className="mb-8 border-b border-current/10 pb-6">
          <p className="text-xs uppercase tracking-wide opacity-60">
            {chapterPosition}
            {authorPenName ? ` · ${authorPenName}` : ""}
          </p>
          <h1
            className={
              "mt-2 text-2xl font-semibold leading-tight sm:text-3xl " +
              (settings.fontFamily === "serif" ? "font-serif" : "font-sans")
            }
          >
            {chapterTitle}
          </h1>
        </header>

        {preview && (
          <p className="mb-6 rounded-lg border border-dashed border-current/30 px-3 py-2 text-xs opacity-80">
            Preview mode — this is exactly what a reader sees. Nothing is being published, and this
            view doesn&apos;t count as a read.
          </p>
        )}

        <AuthorNote position="top" text={authorNoteTop} />

        <div
          className={
            "reader-body " + (settings.fontFamily === "serif" ? "font-serif" : "font-sans")
          }
          style={
            {
              "--reader-font-size": `${settings.fontSize}px`,
              "--reader-line-height": String(settings.lineHeight),
            } as React.CSSProperties
          }
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

        {isNewestChapter ? (
          <CaughtUpCard
            novelStatus={novelStatus}
            suggestions={suggestions}
            endActions={endActions}
          />
        ) : (
          endActions
        )}
      </article>

      <ReaderSheet
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        title="Contents"
      >
        <ContentsPanel
          novelId={novelId}
          chapters={tableOfContents}
          volumes={volumes}
          currentChapterId={chapterId}
        />
      </ReaderSheet>

      <ReaderSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Reading settings"
      >
        <ReaderSettingsPanel settings={settings} />
      </ReaderSheet>
    </div>
  );
}
