import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getGoogleAuthUrl } from "@/lib/oauth/google";

const STATE_COOKIE = "oauth_state";

function callbackUrl(req: NextRequest) {
  return new URL("/api/auth/google/callback", req.nextUrl.origin).toString();
}

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "";
  const state = randomBytes(16).toString("hex");
  const authUrl = await getGoogleAuthUrl(state, callbackUrl(req));
  if (!authUrl) return NextResponse.redirect(new URL("/login?error=google_not_configured", req.nextUrl.origin));

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
