import { cookies } from "next/headers";
import { randomBytes } from "crypto";

// First-party cookie name that carries a random per-browser id for
// logged-out readers, used only to dedup reads. No IP, no fingerprint.
export const GUEST_COOKIE = "nt_guest";

// A year, in seconds. Long enough that a returning guest keeps counting
// as the same person for trending, short enough that a shared device
// eventually rotates.
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Return the guest_key from the request's cookie jar. Returns null if
// there isn't one — the caller (a Server Action) is expected to mint one
// via ensureGuestKey() when it needs to record something.
export async function readGuestKey(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_COOKIE)?.value ?? null;
}

// Return the guest_key, creating one if needed. Only call this from a
// Server Action (or Route Handler) — Server Components can't set
// cookies. The value is a random 16-byte hex string; that's enough
// entropy to be effectively unique per browser without being a
// fingerprint of the visitor.
export async function ensureGuestKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing) return existing;

  const fresh = randomBytes(16).toString("hex");
  store.set(GUEST_COOKIE, fresh, {
    maxAge: GUEST_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Secure only in production; localhost dev needs http.
    secure: process.env.NODE_ENV === "production",
  });
  return fresh;
}
