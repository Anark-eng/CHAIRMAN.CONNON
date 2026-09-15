import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// First-party cookie name that carries a random per-browser id for
// logged-out readers, used only to dedup reads. No IP, no fingerprint.
export const GUEST_COOKIE = "nt_guest";

// A year, in seconds. Long enough that a returning guest keeps counting
// as the same person for trending, short enough that a shared device
// eventually rotates.
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// The cookie's value is `${id}.${hmac}` where `id` is the random guest
// key we actually want to store against a read, and `hmac` is an HMAC
// of `id` under NOVELTREND_GUEST_SECRET.
//
// Signing stops someone hand-editing the cookie to a new id per request
// and inflating their "guest reader" count without limit. It does NOT
// stop them clearing cookies — that mints a new signed pair for the
// new id. The (weight, cap) logic in migration 0005 handles the
// cookie-clearing case.
//
// Changing NOVELTREND_GUEST_SECRET invalidates every existing guest
// cookie: they all look tampered and get replaced next hit, so every
// returning guest looks brand new. Rotate it deliberately.
const SECRET_ENV = "NOVELTREND_GUEST_SECRET";

function getSecret(): string | null {
  const secret = process.env[SECRET_ENV];
  if (!secret || secret.length < 16) return null;
  return secret;
}

function sign(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("hex");
}

function verify(id: string, sig: string, secret: string): boolean {
  const expected = Buffer.from(sign(id, secret), "hex");
  const provided = Buffer.from(sig, "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// Parses whatever's currently in the cookie. Returns the raw id ONLY if
// its signature verifies against the current secret. A tampered or
// unsigned or stale-secret cookie returns null; the caller will then
// mint a fresh one.
function parseCookieValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const secret = getSecret();
  if (!secret) return null; // no secret configured => trust nothing
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!/^[0-9a-f]+$/.test(id) || !/^[0-9a-f]+$/.test(sig)) return null;
  try {
    return verify(id, sig, secret) ? id : null;
  } catch {
    return null;
  }
}

// Server Components can read this; a null return just means the reader
// hasn't got a valid guest cookie yet (which is fine — the record
// action mints one on demand).
export async function readGuestKey(): Promise<string | null> {
  const store = await cookies();
  return parseCookieValue(store.get(GUEST_COOKIE)?.value);
}

// Return the (verified) guest_key, creating a fresh signed one if the
// cookie is missing, tampered, or was signed under an old secret. Only
// call from a Server Action or Route Handler — Server Components can't
// write cookies.
//
// Throws if NOVELTREND_GUEST_SECRET isn't set: read recording without
// signing is worse than not recording, because it lets a guest forge an
// arbitrary key per request.
export async function ensureGuestKey(): Promise<string> {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      `${SECRET_ENV} is not set (or is too short). Guest reads can't be recorded without it — see README.`,
    );
  }
  const store = await cookies();
  const existing = parseCookieValue(store.get(GUEST_COOKIE)?.value);
  if (existing) return existing;

  const fresh = randomBytes(16).toString("hex");
  const value = `${fresh}.${sign(fresh, secret)}`;
  store.set(GUEST_COOKIE, value, {
    maxAge: GUEST_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Secure only in production; localhost dev needs http.
    secure: process.env.NODE_ENV === "production",
  });
  return fresh;
}
