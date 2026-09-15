import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the link Supabase emails to readers for:
//   - confirming a new sign-up (`type=signup`)
//   - starting a password reset (`type=recovery`)
//   - magic-link login (not offered by the site, but harmless to accept)
//
// Both the newer PKCE flow (a `code` query param) and the legacy
// implicit / OTP flow (a `token_hash` and `type` query pair) end up here,
// so we handle both. Anything that fails goes to /auth/error, which shows
// a plain message and a link to the login page.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/auth/error", request.url));
    }
    return NextResponse.redirect(new URL(next, request.url));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      // Cast: verifyOtp's `type` union is narrower than the string we get
      // from the URL; we hand through whatever Supabase sent.
      type: type as Parameters<typeof supabase.auth.verifyOtp>[0]["type"],
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(new URL("/auth/error", request.url));
    }
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/auth/error", request.url));
}
