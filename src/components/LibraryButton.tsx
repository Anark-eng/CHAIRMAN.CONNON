"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addToLibrary, removeFromLibrary } from "@/lib/actions/library";

// Distinct visual states for Add to library and In library, with an
// optimistic toggle and a small "Saved" / "Removed" acknowledgement so
// the reader knows the tap did something. The button remembers the
// server-derived initial state so a page refresh looks the same.
export function LibraryButton({
  novelId,
  initialInLibrary,
  isLoggedIn,
}: {
  novelId: string;
  initialInLibrary: boolean;
  isLoggedIn: boolean;
}) {
  const [inLibrary, setInLibrary] = useState(initialInLibrary);
  const [flash, setFlash] = useState<"added" | "removed" | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        Log in to save to library
      </Link>
    );
  }

  function toggle() {
    const nextInLibrary = !inLibrary;
    setInLibrary(nextInLibrary);
    setFlash(nextInLibrary ? "added" : "removed");
    startTransition(async () => {
      try {
        if (nextInLibrary) {
          await addToLibrary(novelId);
        } else {
          await removeFromLibrary(novelId);
        }
      } catch {
        setInLibrary(!nextInLibrary); // roll back
        setFlash(null);
      } finally {
        setTimeout(() => setFlash(null), 1800);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={inLibrary}
        disabled={pending}
        className={
          "rounded-full px-4 py-2 text-sm font-medium transition-colors " +
          (inLibrary
            ? "border border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
            : "border border-[var(--border)] hover:bg-[var(--surface)]")
        }
      >
        {inLibrary ? (
          <>
            <span aria-hidden>✓ </span>In library
          </>
        ) : (
          "Add to library"
        )}
      </button>
      {flash && (
        <span aria-live="polite" className="text-xs text-[var(--muted)]">
          {flash === "added" ? "Saved" : "Removed"}
        </span>
      )}
    </div>
  );
}
