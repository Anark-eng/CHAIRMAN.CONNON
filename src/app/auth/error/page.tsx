import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Link expired or already used</h1>
      <p className="mt-3 text-[var(--muted)]">
        This confirmation or reset link isn&apos;t valid any more. Links can only be used
        once, and they expire after a short time.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
        <Link
          href="/login"
          className="rounded-full bg-[var(--brand)] px-4 py-2 font-medium text-[var(--brand-foreground)]"
        >
          Go to log in
        </Link>
        <Link href="/forgot-password" className="rounded-full border border-[var(--border)] px-4 py-2 font-medium">
          Request a new link
        </Link>
      </div>
    </div>
  );
}
