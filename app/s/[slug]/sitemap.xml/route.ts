import { getStoreBySlug, getStoreProducts } from "@/lib/storefront/store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  const origin = new URL(req.url).origin;
  if (!store || !store.published) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, {
      headers: { "content-type": "application/xml" },
    });
  }

  const products = await getStoreProducts(store.businessId);
  const urls = [
    `${origin}/`,
    `${origin}/products`,
    `${origin}/about`,
    `${origin}/contact`,
    ...products.map((p) => `${origin}/products/${p.slug}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;

  return new Response(xml, { headers: { "content-type": "application/xml" } });
}
