import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/data/profile";
import { logOut } from "@/lib/actions/auth";

export async function NavBar() {
  const { user, profile } = await getCurrentUserAndProfile();

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-[var(--brand)]">
          NovelTrend
        </Link>

        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/browse">Browse</Link>
          {user && <Link href="/updates">Updates</Link>}
          {user && <Link href="/library">Library</Link>}
          {profile?.is_author && <Link href="/my-novels">My Novels</Link>}
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/profile">{profile?.pen_name ?? "Profile"}</Link>
              <form action={logOut}>
                <button type="submit" className="text-[var(--muted)] hover:text-[var(--foreground)]">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link
                href="/signup"
                className="rounded-full bg-[var(--brand)] px-3 py-1.5 font-medium text-[var(--brand-foreground)]"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
