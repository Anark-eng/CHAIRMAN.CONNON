"use client";

import { useState, useTransition } from "react";
import { exportUserData } from "@/lib/actions/profile";

export function DataExportSection() {
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleExport() {
    setMessage(null);
    startTransition(async () => {
      const result = await exportUserData();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      // Turn the base64 payload into a downloadable file client-side.
      const bin = atob(result.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage("Your export has been downloaded.");
    });
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <button
        type="button"
        onClick={handleExport}
        disabled={busy}
        className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-60"
      >
        {busy ? "Preparing…" : "Download my data (JSON)"}
      </button>
      {message && <p className="mt-3 text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}
