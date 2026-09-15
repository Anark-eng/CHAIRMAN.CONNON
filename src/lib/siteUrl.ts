// Where the site is publicly reachable — the origin auth emails should
// send readers back to. Preference order:
//
//   1. NEXT_PUBLIC_SITE_URL (set explicitly by the owner)
//   2. NEXT_PUBLIC_VERCEL_URL (filled in automatically by Vercel)
//   3. http://localhost:3000 (local development fallback)
//
// The value MUST be a full absolute URL — Supabase's redirect config
// compares strings, so a trailing slash matters. We normalise here.
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "http://localhost:3000");

  // Trim any trailing slash so callers can safely append a path.
  return raw.replace(/\/+$/, "");
}
