export const STOREFRONT_ROOT = (process.env.STOREFRONT_ROOT_DOMAIN ?? "zotomic.com").toLowerCase();

const HOST_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** Clean owner input into a bare hostname, or null if it isn't a usable domain. */
export function normalizeDomain(input: string): string | null {
  let h = (input || "").trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").replace(/\.$/, "");
  if (!h || !HOST_RE.test(h) || h.length > 253) return null;
  // can't be the platform's own domain
  if (h === STOREFRONT_ROOT || h.endsWith(`.${STOREFRONT_ROOT}`)) return null;
  if (h.endsWith(".vercel.app") || h === "localhost" || h.endsWith(".localhost")) return null;
  return h;
}

/** Hosts the middleware should never treat as a custom storefront domain. */
export function isPlatformHost(host: string): boolean {
  const h = (host || "").split(":")[0].toLowerCase();
  return (
    !h ||
    h === STOREFRONT_ROOT ||
    h.endsWith(`.${STOREFRONT_ROOT}`) ||
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "127.0.0.1" ||
    h.endsWith(".vercel.app") ||
    !h.includes(".")
  );
}
