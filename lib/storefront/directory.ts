import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export interface PublishedStorefront {
  name: string;
  slug: string;
  logoUrl: string | null;
}

/** Every business with a live, published storefront — shown on the marketing homepage. */
export const getPublishedStorefronts = unstable_cache(
  async (): Promise<PublishedStorefront[]> => {
    const db = getAdminSupabase();
    const { data } = await db
      .from("storefront_config")
      .select("published_at, business:businesses!inner(name, slug, logo_url, status)")
      .not("published_at", "is", null);

    return (data ?? [])
      .map((row) => row.business as unknown as { name: string; slug: string | null; logo_url: string | null; status: string })
      .filter((b) => b && b.slug && b.status === "active")
      .map((b) => ({ name: b.name, slug: b.slug as string, logoUrl: b.logo_url }));
  },
  ["published-storefronts"],
  { revalidate: 300, tags: ["published-storefronts"] },
);
