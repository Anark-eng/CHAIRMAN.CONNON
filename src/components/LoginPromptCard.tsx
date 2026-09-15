import Link from "next/link";

export function LoginPromptCard({ message }: { message: string }) {
  return (
    <div className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
      <p>{message}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-full bg-[var(--brand)] px-4 py-1.5 font-medium text-[var(--brand-foreground)]"
        >
          Log in
        </Link>
        <Link href="/signup" className="rounded-full border border-[var(--border)] px-4 py-1.5 font-medium">
          Create an account
        </Link>
      </div>
    </div>
  );
}
