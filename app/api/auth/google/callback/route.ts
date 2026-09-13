import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-server";
import { exchangeGoogleCode } from "@/lib/oauth/google";
import { completeOAuthSignIn } from "@/lib/oauth/session";

const STATE_COOKIE = "oauth_state";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const fail = (message: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));

  const code = req.nextUrl.searchParams.get("code");
  const returnedState = req.nextUrl.searchParams.get("state");
  const raw = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !returnedState || !raw) return fail("Sign-in was cancelled or expired.");

  let stored: { state: string; next: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return fail("Sign-in was cancelled or expired.");
  }
  if (stored.state !== returnedState) return fail("Sign-in could not be verified. Please try again.");

  const profile = await exchangeGoogleCode(code, new URL("/api/auth/google/callback", origin).toString());
  if ("error" in profile) return fail(profile.error);
  if (!profile.verifiedEmail) return fail("Please use a Google account with a verified email address.");

  const result = await completeOAuthSignIn({ provider: "google", providerId: profile.id, email: profile.email, name: profile.name });
  if ("error" in result) return fail(result.error);

  const redirectTo = stored.next || result.redirect;
  const res = NextResponse.redirect(new URL(redirectTo, origin));
  res.cookies.delete(STATE_COOKIE);
  res.cookies.set(AUTH_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
