import { headers } from "next/headers";

/** "" when served from a storefront host, "/s/<slug>" for path-based preview. */
export async function storeBasePath(slug: string): Promise<string> {
  const h = await headers();
  return h.get("x-sf-root-host") === "1" ? "" : `/s/${slug}`;
}
