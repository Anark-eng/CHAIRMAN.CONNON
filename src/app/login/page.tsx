import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { logIn } from "@/lib/actions/auth";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Log in</h1>
      <AuthForm action={logIn} submitLabel="Log in" />
      <p className="mt-4 text-sm">
        <Link href="/forgot-password" className="text-[var(--muted)] hover:text-[var(--brand)]">
          Forgot your password?
        </Link>
      </p>
      <p className="mt-6 text-sm text-[var(--muted)]">
        New here?{" "}
        <Link href="/signup" className="text-[var(--brand)]">
          Create an account
        </Link>
      </p>
    </div>
  );
}
