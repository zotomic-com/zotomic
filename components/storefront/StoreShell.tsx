import Link from "next/link";
import { FONT_STACKS, RADIUS_PX, RADIUS_LG_PX, type StorefrontConfig } from "@/lib/storefront/config";
import { GA4, MetaPixel } from "@/components/tracking/Pixel";
import { StorefrontTracker } from "./StorefrontTracker";
import { HeaderActions } from "./HeaderActions";
import { HeaderSearch } from "./HeaderSearch";
import { AccountLink } from "./AccountLink";
import { MenuDrawer } from "./MenuDrawer";
import { MobileNav } from "./MobileNav";

/** Storefront chrome. Scopes accent/font/radius/shadow via CSS vars so it never
 *  collides with the Zotomic app styles. */
export function StoreShell({
  config,
  basePath,
  storeSlug,
  children,
}: {
  config: StorefrontConfig;
  /** "" for a real host, or "/s/<slug>" for path-based preview */
  basePath: string;
  /** omit for the editor preview (no analytics) */
  storeSlug?: string;
  children: React.ReactNode;
}) {
  const { brand, announcement, nav, footer } = config;
  const dark = brand.theme === "dark";
  const href = (h: string) => (h.startsWith("/") ? `${basePath}${h === "/" ? "" : h}` || "/" : h);

  // Set the theme tokens on :root so body-level portals (bottom sheets, image
  // zoom, drawers, modals) inherit them too. One storefront renders per page.
  const rootCss = `:root{
    --sf-accent:${brand.accent};
    --sf-accent-soft:color-mix(in srgb, ${brand.accent} 12%, transparent);
    --sf-radius:${RADIUS_PX[brand.radius]};
    --sf-radius-lg:${RADIUS_LG_PX[brand.radius]};
    --sf-bg:${dark ? "#0b0f14" : "#ffffff"};
    --sf-fg:${dark ? "#e7eaee" : "#14181d"};
    --sf-muted:${dark ? "#9aa4af" : "#5b6570"};
    --sf-line:${dark ? "#232a32" : "#e9ebee"};
    --sf-card:${dark ? "#11161c" : "#f6f7f8"};
    --sf-elevated:${dark ? "#141a21" : "#ffffff"};
    --sf-shadow:${dark ? "0 1px 2px rgba(0,0,0,.4), 0 12px 32px -14px rgba(0,0,0,.6)" : "0 1px 2px rgba(16,24,40,.04), 0 12px 28px -14px rgba(16,24,40,.14)"};
  }
  body{font-family:${FONT_STACKS[brand.font]}}`;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--sf-bg)] text-[var(--sf-fg)]" style={{ fontFamily: FONT_STACKS[brand.font] }}>
      <style dangerouslySetInnerHTML={{ __html: rootCss }} />
      <MetaPixel id={config.tracking?.metaPixelId ?? ""} />
      <GA4 id={config.tracking?.ga4MeasurementId ?? ""} />
      {storeSlug ? <StorefrontTracker storeSlug={storeSlug} /> : null}
      {announcement.enabled && announcement.text && (
        <div className="bg-[var(--sf-accent)] px-4 py-2 text-center text-xs font-medium text-white">
          {announcement.href ? (
            <a href={href(announcement.href)}>{announcement.text}</a>
          ) : (
            announcement.text
          )}
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-[var(--sf-line)] bg-[var(--sf-bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href={href("/")} className="flex shrink-0 items-center gap-2 font-extrabold tracking-tight">
            {brand.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={brand.logoUrl} alt={brand.storeName} className="h-8 w-auto" />
            ) : (
              <span className="text-lg">{brand.storeName}</span>
            )}
          </Link>

          <nav className="hidden items-center gap-0.5 md:flex">
            {nav.map((n) => (
              <Link
                key={n.href + n.label}
                href={href(n.href)}
                className="rounded-[var(--sf-radius)] px-3 py-2 text-sm text-[var(--sf-muted)] transition-colors hover:text-[var(--sf-fg)]"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {storeSlug ? <HeaderSearch basePath={basePath} /> : null}
            <div className="hidden items-center gap-1 sm:flex">
              {storeSlug ? <AccountLink storeSlug={storeSlug} basePath={basePath} /> : null}
              {storeSlug ? (
                <HeaderActions storeSlug={storeSlug} basePath={basePath} />
              ) : (
                <Link
                  href={href("/cart")}
                  className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] px-3 py-1.5 text-sm font-medium"
                >
                  Cart
                </Link>
              )}
            </div>
            {/* nav drawer — mobile/tablet where the inline nav links are hidden */}
            <MenuDrawer nav={nav} basePath={basePath} storeSlug={storeSlug} triggerClassName="rounded-[var(--sf-radius)] p-2 md:hidden" />
          </div>
        </div>
      </header>

      <main className={`flex-1 ${storeSlug ? "pb-24 sm:pb-0" : ""}`}>{children}</main>

      {storeSlug ? <MobileNav storeSlug={storeSlug} basePath={basePath} /> : null}

      <footer className="mt-20 border-t border-[var(--sf-line)] bg-[var(--sf-card)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div>
            <p className="font-extrabold">{brand.storeName}</p>
            {brand.tagline && <p className="mt-2 text-sm text-[var(--sf-muted)]">{brand.tagline}</p>}
          </div>
          {footer.columns.map((c) => (
            <div key={c.title}>
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--sf-muted)]">{c.title}</p>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={href(l.href)} className="text-sm text-[var(--sf-muted)] transition-colors hover:text-[var(--sf-fg)]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 border-t border-[var(--sf-line)] px-4 py-6 text-xs text-[var(--sf-muted)] sm:flex-row sm:px-6">
          <p>
            &copy; {new Date().getFullYear()} {brand.storeName}
            {footer.note ? ` · ${footer.note}` : ""}
          </p>
          <p>
            Powered by <span className="font-semibold">Zotomic</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
