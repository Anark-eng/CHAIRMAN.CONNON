import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { signUp } from "@/lib/actions/auth";

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Create an account</h1>
      <AuthForm action={signUp} submitLabel="Sign up" />
      <p className="mt-6 text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--brand)]">
          Log in
        </Link>
      </p>
    </div>
  );
}
