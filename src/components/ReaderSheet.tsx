"use client";

import { useEffect, useId, useRef } from "react";

// A small overlay used by the reader's Contents and Settings buttons.
// Renders as a bottom sheet on phones and as a right-side popover on
// wider screens — the reading position is preserved because the sheet
// sits on top of the page rather than moving it. Backdrop click, ESC
// key and the header × all close it; focus is moved into the sheet and
// restored on close.
//
// No animation library. A single `transform` transition (skipped when
// prefers-reduced-motion is set, by our global CSS override) is enough.
export function ReaderSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const headingId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    // Move focus into the sheet for keyboard users. Falls back to the
    // sheet root so ESC + Tab work even when there's no interactive
    // child.
    requestAnimationFrame(() => {
      const first =
        sheetRef.current?.querySelector<HTMLElement>(
          'a, button, [tabindex]:not([tabindex="-1"]), input, select, textarea',
        ) ?? sheetRef.current;
      first?.focus();
    });

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="presentation">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={
          // Phone: bottom sheet full-width, capped height; desktop:
          // right-side popover, capped width, full height.
          "relative flex flex-col overflow-hidden bg-[var(--reader-bg,#fff)] text-[var(--reader-fg,#111)] " +
          "shadow-xl w-full max-h-[85vh] rounded-t-2xl " +
          "sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-2xl"
        }
      >
        <header className="flex items-center justify-between border-b border-current/10 px-4 py-3">
          <h2 id={headingId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="reader-hit flex items-center justify-center rounded-full hover:bg-current/10"
          >
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-current/10 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
