import { headers } from "next/headers";

/**
 * Link prefix for storefront pages:
 *   ""          — dedicated (sub)domain host (<slug>.zotomic.com)
 *   "/<slug>"   — shared-domain path form (zotomic.com/<slug>)
 *   "/s/<slug>" — direct /s/<slug> access or the in-app editor preview
 */
export async function storeBasePath(slug: string): Promise<string> {
  const h = await headers();
  if (h.get("x-sf-root-host") === "1") return "";
  const pathBase = h.get("x-sf-path-base");
  if (pathBase) return pathBase;
  return `/s/${slug}`;
}
