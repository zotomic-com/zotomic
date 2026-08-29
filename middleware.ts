import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getRoleRedirect } from "@/lib/jwt";

const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];
const STOREFRONT_ROOT = process.env.STOREFRONT_ROOT_DOMAIN ?? "zotomic.com";
// Hosts that serve the main Zotomic app (never treated as a storefront subdomain).
const APP_HOSTS = new Set(["localhost", "127.0.0.1"]);
// Subdomains reserved for the platform, not stores.
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "assets", "cdn", "mail", "static", "zotomic-lilac"]);

// First path segment that must NEVER be treated as a store slug on the shared
// domain (zotomic.com/<slug>). Keep in sync with app/* top-level routes.
const RESERVED_PATHS = new Set([
  "s",
  "app",
  "admin",
  "api",
  "onboarding",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "about",
  "contact",
  "help",
  "pricing",
  "features",
  "how-it-works",
  "intelligence",
  "assistant",
  "storefront",
  "storefront-preview",
  "privacy-policy",
  "terms",
  "refund-policy",
  "data-deletion",
  "faq",
  "legal",
  "robots.txt",
  "sitemap.xml",
  "icon.svg",
  "favicon.ico",
  "manifest.json",
  "_next",
  "_vercel",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function storefrontSubdomain(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (APP_HOSTS.has(h)) return null;

  let sub: string | null = null;
  if (h.endsWith(`.${STOREFRONT_ROOT}`)) sub = h.slice(0, -(STOREFRONT_ROOT.length + 1));
  else if (h.endsWith(".localhost")) sub = h.slice(0, -".localhost".length); // dev: shop.localhost
  else return null;

  if (!sub || sub.includes(".") || RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";

  // ── dedicated storefront subdomain (<slug>.zotomic.com) ──────────────────
  const sub = storefrontSubdomain(host);
  if (sub) {
    if (pathname.startsWith("/s/") || pathname.startsWith("/_next") || pathname.startsWith("/api")) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = `/s/${sub}${pathname === "/" ? "" : pathname}`;
    const reqHeaders = new Headers(req.headers);
    reqHeaders.set("x-sf-root-host", "1"); // renderer basePath = ""
    return NextResponse.rewrite(url, { request: { headers: reqHeaders } });
  }

  // ── shared-domain path storefront (zotomic.com/<slug>/…) ─────────────────
  const seg = pathname.split("/")[1] ?? "";
  if (
    seg &&
    seg !== "s" &&
    !RESERVED_PATHS.has(seg) &&
    SLUG_RE.test(seg) &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = `/s${pathname}`;
    const reqHeaders = new Headers(req.headers);
    reqHeaders.set("x-sf-path-base", `/${seg}`); // renderer basePath = "/<slug>"
    return NextResponse.rewrite(url, { request: { headers: reqHeaders } });
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
