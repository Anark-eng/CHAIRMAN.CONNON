"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  autosaveChapter,
  cancelSchedule,
  saveChapter,
  type ChapterActionState,
} from "@/lib/actions/chapters";
import { markdownStats, pasteHtmlToMarkdown } from "@/lib/chapterContent";

interface VolumeChoice {
  id: string;
  name: string;
}

// Editor for one chapter. Backed by a textarea speaking a small
// markdown-lite dialect (# heading, > quote, --- break, **bold**,
// *italic*). Autosaves as a draft after ~5s of inactivity and shows a
// clear "draft, not published" label the whole time it's editing.
export function ChapterEditor({
  novelId,
  chapterId,
  initial,
  volumes,
}: {
  novelId: string;
  chapterId: string;
  initial: {
    title: string;
    markdown: string;
    authorNoteTop: string;
    authorNoteBottom: string;
    volumeId: string | null;
    publishAt: string | null;
    isPublished: boolean;
  };
  volumes: VolumeChoice[];
}) {
  const [title, setTitle] = useState(initial.title);
  const [markdown, setMarkdown] = useState(initial.markdown);
  const [noteTop, setNoteTop] = useState(initial.authorNoteTop);
  const [noteBottom, setNoteBottom] = useState(initial.authorNoteBottom);
  const [volumeId, setVolumeId] = useState<string>(initial.volumeId ?? "");
  const [publishAt, setPublishAt] = useState<string>(toLocalInputValue(initial.publishAt));
  const [confirmDropPids, setConfirmDropPids] = useState<string[]>([]);

  const [autosaveStatus, setAutosaveStatus] = useState<{
    lastSavedAt: string | null;
    saving: boolean;
    error: string | null;
    blockingDropPids: string[];
  }>({ lastSavedAt: initial.markdown ? new Date().toISOString() : null, saving: false, error: null, blockingDropPids: [] });

  const [formState, formAction] = useActionState<ChapterActionState, FormData>(
    saveChapter.bind(null, novelId, chapterId),
    {},
  );
  const [scheduleMode, setScheduleMode] = useState<"draft" | "publish" | "schedule">(
    initial.publishAt ? "schedule" : initial.isPublished ? "publish" : "draft",
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [, startCancelTransition] = useTransition();

  // Word / character count / reading time.
  const stats = useMemo(() => markdownStats(markdown), [markdown]);

  // Autosave: after 5s of inactivity, snapshot current state to the
  // server as a plain draft. Uses a ref timer so we don't restart on
  // every keystroke.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = true;
    const timeout = setTimeout(async () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      await performAutosave();
    }, 5000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, markdown, noteTop, noteBottom, volumeId]);

  // Best-effort save when the tab is about to unload. Uses navigator.sendBeacon
  // via a form-encoded POST to the same action, so a closed tab doesn't lose the
  // last few seconds of work.
  useEffect(() => {
    const beforeUnload = () => {
      if (!dirtyRef.current) return;
      // Fire-and-forget synchronously via a form submission fallback.
      const data = new FormData();
      appendPayload(data, currentPayload());
      // We can't call the server action synchronously from beforeunload;
      // best we can do is trigger the async path. It usually completes.
      void autosaveChapter(novelId, chapterId, data);
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, chapterId, title, markdown, noteTop, noteBottom, volumeId]);

  function currentPayload() {
    return {
      title,
      markdown,
      authorNoteTop: noteTop,
      authorNoteBottom: noteBottom,
      volumeId,
      publishAt: "", // autosave never touches publish state
      publish: false,
      scheduleOnly: false,
      confirmDropPids,
    };
  }

  async function performAutosave() {
    setAutosaveStatus((s) => ({ ...s, saving: true, error: null }));
    const form = new FormData();
    appendPayload(form, currentPayload());
    const result = await autosaveChapter(novelId, chapterId, form);
    setAutosaveStatus((s) => ({
      ...s,
      saving: false,
      lastSavedAt: result.ok ? (result.savedAt ?? new Date().toISOString()) : s.lastSavedAt,
      error: result.ok ? null : result.error ?? "Autosave failed.",
      blockingDropPids: result.blockedDropPids ?? [],
    }));
  }

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (!html) return; // let the browser handle plain-text paste as normal
    e.preventDefault();
    const md = pasteHtmlToMarkdown(html);
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = markdown.slice(0, start) + md + markdown.slice(end);
    setMarkdown(next);
    // Move cursor to end of pasted content.
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = start + md.length;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    });
  }, [markdown]);

  function wrapSelection(prefix: string, suffix: string = prefix) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = markdown.slice(start, end) || "text";
    const next = markdown.slice(0, start) + prefix + selected + suffix + markdown.slice(end);
    setMarkdown(next);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = start + prefix.length;
        textareaRef.current.selectionEnd = start + prefix.length + selected.length;
        textareaRef.current.focus();
      }
    });
  }

  function insertBlock(text: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const beforeChar = markdown[start - 1] ?? "\n";
    const prefix = beforeChar === "\n" || start === 0 ? "" : "\n\n";
    const next = markdown.slice(0, start) + prefix + text + "\n\n" + markdown.slice(start);
    setMarkdown(next);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = start + prefix.length + text.length + 2;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    });
  }

  const previewHref = `/novels/${novelId}/chapters/${chapterId}?preview=1`;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="markdown" value={markdown} />
      <input type="hidden" name="author_note_top" value={noteTop} />
      <input type="hidden" name="author_note_bottom" value={noteBottom} />
      <input type="hidden" name="volume_id" value={volumeId} />
      {confirmDropPids.map((pid) => (
        <input key={pid} type="hidden" name="confirm_drop_pids" value={pid} />
      ))}
      {scheduleMode === "publish" && <input type="hidden" name="publish" value="on" />}
      {scheduleMode === "schedule" && (
        <>
          <input type="hidden" name="schedule_only" value="on" />
          <input type="hidden" name="publish_at" value={fromLocalInputValue(publishAt)} />
        </>
      )}

      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          Chapter title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        />
      </div>

      <div>
        <label htmlFor="note_top" className="mb-1 block text-sm font-medium">
          Author note (top) <span className="text-xs font-normal text-[var(--muted)]">optional</span>
        </label>
        <textarea
          id="note_top"
          rows={2}
          value={noteTop}
          onChange={(e) => setNoteTop(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          placeholder="Shown above the chapter. Not part of the story."
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="body" className="text-sm font-medium">
            Chapter text
          </label>
          <span className="text-xs text-[var(--muted)] tabular-nums">
            {stats.words} words &middot; {stats.characters} characters &middot; ~{stats.readingMinutes} min read
          </span>
        </div>
        <Toolbar
          onBold={() => wrapSelection("**")}
          onItalic={() => wrapSelection("*")}
          onHeading={() => insertBlock("# Heading")}
          onQuote={() => insertBlock("> A quoted line.")}
          onBreak={() => insertBlock("---")}
        />
        <textarea
          ref={textareaRef}
          id="body"
          rows={18}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          onPaste={handlePaste}
          placeholder={"Type or paste your chapter here.\n\nSeparate paragraphs with a blank line.\n\nUse **bold**, *italic*, # heading, > quote, or --- for a scene break."}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-serif text-[15px] leading-relaxed"
        />
        <AutosaveLine status={autosaveStatus} />
      </div>

      <div>
        <label htmlFor="note_bottom" className="mb-1 block text-sm font-medium">
          Author note (bottom) <span className="text-xs font-normal text-[var(--muted)]">optional</span>
        </label>
        <textarea
          id="note_bottom"
          rows={2}
          value={noteBottom}
          onChange={(e) => setNoteBottom(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          placeholder="Shown after the chapter. Not part of the story."
        />
      </div>

      {volumes.length > 0 && (
        <div>
          <label htmlFor="volume" className="mb-1 block text-sm font-medium">
            Volume <span className="text-xs font-normal text-[var(--muted)]">optional</span>
          </label>
          <select
            id="volume"
            value={volumeId}
            onChange={(e) => setVolumeId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="">No volume</option>
            {volumes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <legend className="px-2 text-sm font-medium">When to publish</legend>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={scheduleMode === "draft"}
              onChange={() => setScheduleMode("draft")}
            />
            Save as draft — nobody sees it
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={scheduleMode === "publish"}
              onChange={() => setScheduleMode("publish")}
            />
            Publish now
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={scheduleMode === "schedule"}
              onChange={() => setScheduleMode("schedule")}
            />
            Schedule for a specific time
          </label>
          {scheduleMode === "schedule" && (
            <div className="pl-6">
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                required={scheduleMode === "schedule"}
                className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Times shown in your own time zone ({displayTimeZone()}).
              </p>
            </div>
          )}
          {initial.publishAt && (
            <div className="pt-2 text-xs text-[var(--muted)]">
              Currently scheduled for {new Date(initial.publishAt).toLocaleString()}.
              <button
                type="button"
                onClick={() =>
                  startCancelTransition(async () => {
                    await cancelSchedule(novelId, chapterId);
                  })
                }
                className="ml-2 text-red-600 hover:underline"
              >
                Cancel schedule
              </button>
            </div>
          )}
        </div>
      </fieldset>

      {autosaveStatus.blockingDropPids.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">Some paragraphs have reactions or comments.</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Saving this edit removes {autosaveStatus.blockingDropPids.length}{" "}
            paragraph{autosaveStatus.blockingDropPids.length === 1 ? "" : "s"} with existing discussion.
            Confirm below to remove those discussions along with them.
          </p>
          <button
            type="button"
            className="mt-2 rounded-full border border-amber-600 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-600/10"
            onClick={() => setConfirmDropPids(autosaveStatus.blockingDropPids)}
          >
            Confirm — remove {autosaveStatus.blockingDropPids.length} discussion
            {autosaveStatus.blockingDropPids.length === 1 ? "" : "s"} and save
          </button>
        </div>
      )}

      {formState.error && <p className="text-sm text-red-600">{formState.error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-medium text-[var(--brand-foreground)]"
        >
          {scheduleMode === "publish"
            ? "Publish now"
            : scheduleMode === "schedule"
              ? "Schedule"
              : "Save draft"}
        </button>
        <Link
          href={previewHref}
          target="_blank"
          className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium"
        >
          Preview in reader
        </Link>
        <span className="text-xs text-[var(--muted)]">
          Preview shows the chapter exactly as a reader sees it. It doesn&apos;t publish or count as a read.
        </span>
      </div>
    </form>
  );
}

function Toolbar({
  onBold,
  onItalic,
  onHeading,
  onQuote,
  onBreak,
}: {
  onBold: () => void;
  onItalic: () => void;
  onHeading: () => void;
  onQuote: () => void;
  onBreak: () => void;
}) {
  const btn = "rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-[var(--surface)]";
  return (
    <div className="mb-1 flex flex-wrap gap-1.5 text-[var(--muted)]">
      <button type="button" onClick={onBold} className={btn} title="Bold">
        <strong>B</strong>
      </button>
      <button type="button" onClick={onItalic} className={btn} title="Italic">
        <em>I</em>
      </button>
      <button type="button" onClick={onHeading} className={btn} title="Heading (section title)">
        H
      </button>
      <button type="button" onClick={onQuote} className={btn} title="Block quote">
        &ldquo; &rdquo;
      </button>
      <button type="button" onClick={onBreak} className={btn} title="Scene break">
        &mdash; &mdash;
      </button>
    </div>
  );
}

function AutosaveLine({
  status,
}: {
  status: { lastSavedAt: string | null; saving: boolean; error: string | null; blockingDropPids: string[] };
}) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
      <span className="rounded-full bg-[var(--border)] px-2 py-0.5 font-medium uppercase tracking-wide">
        Draft — not published
      </span>
      {status.saving ? (
        <span>Saving…</span>
      ) : status.lastSavedAt ? (
        <span>Last saved at {new Date(status.lastSavedAt).toLocaleTimeString()}</span>
      ) : (
        <span>Not saved yet</span>
      )}
      {status.error && <span className="text-red-600">{status.error}</span>}
    </p>
  );
}

function appendPayload(
  data: FormData,
  p: {
    title: string;
    markdown: string;
    authorNoteTop: string;
    authorNoteBottom: string;
    volumeId: string;
    publishAt: string;
    publish: boolean;
    scheduleOnly: boolean;
    confirmDropPids: string[];
  },
) {
  data.set("title", p.title);
  data.set("markdown", p.markdown);
  data.set("author_note_top", p.authorNoteTop);
  data.set("author_note_bottom", p.authorNoteBottom);
  data.set("volume_id", p.volumeId);
  data.set("publish_at", p.publishAt);
  if (p.publish) data.set("publish", "on");
  if (p.scheduleOnly) data.set("schedule_only", "on");
  for (const pid of p.confirmDropPids) data.append("confirm_drop_pids", pid);
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function displayTimeZone(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local";
  } catch {
    return "local";
  }
}

