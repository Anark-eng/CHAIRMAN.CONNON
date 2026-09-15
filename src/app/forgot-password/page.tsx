import Link from "next/link";
import { EmailOnlyForm } from "@/components/EmailOnlyForm";
import { requestPasswordReset } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Forgot your password?</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Enter your email address and we&apos;ll send you a link to set a new one.
      </p>
      <EmailOnlyForm action={requestPasswordReset} submitLabel="Send reset link" />
      <p className="mt-6 text-sm text-[var(--muted)]">
        <Link href="/login" className="text-[var(--brand)]">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
