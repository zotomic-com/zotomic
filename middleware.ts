import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getRoleRedirect } from "@/lib/jwt";

const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isApp = pathname === "/app" || pathname.startsWith("/app/");
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const token = req.cookies.get("auth_token")?.value;
  const user = token ? await verifyToken(token) : null;

  // Protected areas — must be signed in.
  if ((isApp || isOnboarding || isAdmin) && !user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete("auth_token");
    return res;
  }

  if (user) {
    // Admin area is admin-only; everyone else bounced to their home.
    if (isAdmin && user.role !== "admin") {
      return NextResponse.redirect(new URL(getRoleRedirect(user.role), req.url));
    }
    // Admins don't use the tenant app.
    if ((isApp || isOnboarding) && user.role === "admin") {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    // Signed-in users shouldn't see auth pages.
    if (isAuthPage) {
      return NextResponse.redirect(new URL(getRoleRedirect(user.role), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding/:path*", "/admin/:path*", "/login", "/signup", "/forgot-password"],
};
