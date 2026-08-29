import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getRoleRedirect } from "@/lib/jwt";

const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];
const STOREFRONT_ROOT = process.env.STOREFRONT_ROOT_DOMAIN ?? "zotomic.store";
// Hosts that serve the main Zotomic app (never treated as a storefront).
const APP_HOSTS = new Set(["localhost", "127.0.0.1"]);

function storefrontSlug(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (APP_HOSTS.has(h)) return null;
  if (h.endsWith(`.${STOREFRONT_ROOT}`)) return h.slice(0, -(STOREFRONT_ROOT.length + 1)) || null;
  if (h.endsWith(".localhost")) return h.slice(0, -".localhost".length) || null; // dev: shop.localhost
  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";

  // ── storefront hosts ─────────────────────────────────────────────────────
  const slug = storefrontSlug(host);
  if (slug) {
    if (pathname.startsWith("/s/") || pathname.startsWith("/_next") || pathname.startsWith("/api")) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = `/s/${slug}${pathname === "/" ? "" : pathname}`;
    const res = NextResponse.rewrite(url);
    res.headers.set("x-sf-root-host", "1"); // tells the renderer basePath is ""
    return res;
  }

  // ── main app auth/routing ────────────────────────────────────────────────
  const isApp = pathname === "/app" || pathname.startsWith("/app/");
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isApp && !isOnboarding && !isAdmin && !isAuthPage) return NextResponse.next();

  const token = req.cookies.get("auth_token")?.value;
  const user = token ? await verifyToken(token) : null;

  if ((isApp || isOnboarding || isAdmin) && !user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete("auth_token");
    return res;
  }

  if (user) {
    if (isAdmin && user.role !== "admin") {
      return NextResponse.redirect(new URL(getRoleRedirect(user.role), req.url));
    }
    if ((isApp || isOnboarding) && user.role === "admin") {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    if (isAuthPage) {
      return NextResponse.redirect(new URL(getRoleRedirect(user.role), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals + binary assets so storefront host
  // rewrites reach pages, robots.txt, sitemap.xml and llms.txt.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
