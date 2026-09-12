import { getStoreBySlug, getStoreProducts } from "@/lib/storefront/store";
import { money } from "@/lib/money";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  const origin = new URL(req.url).origin;

  if (!store || !store.published) {
    return new Response("# Store not available", { headers: { "content-type": "text/plain" } });
  }

  const products = await getStoreProducts(store.businessId);
  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))];

  const out = [
    `# ${store.name}`,
    "",
    store.config.seo.description || store.config.brand.tagline || `Online store: ${store.name}.`,
    "",
    "## Key pages",
    `- Home: ${origin}/`,
    `- All products: ${origin}/products`,
    `- About: ${origin}/about`,
    `- Contact: ${origin}/contact`,
    "",
    cats.length ? `## Categories\n${cats.map((c) => `- ${c}`).join("\n")}\n` : "",
    "## Products",
    ...products.map(
      (p) =>
        `- ${p.name} — ${money(p.salePrice ?? p.price, store.currency)} — ${origin}/products/${p.slug}`,
    ),
    "",
    "## Ordering",
    store.config.commerce.codEnabled
      ? "Cash on delivery available. Checkout collects name, phone and address."
      : "Payment on delivery. Checkout collects name, phone and address.",
    `Delivery: ${[
      ...store.config.commerce.deliveryZones.map(
        (z) => `${z.name} ${z.charge === 0 ? "free" : money(z.charge, store.currency)}`,
      ),
      `${store.config.commerce.deliveryDefaultLabel} ${
        store.config.commerce.deliveryDefaultCharge === 0 ? "free" : money(store.config.commerce.deliveryDefaultCharge, store.currency)
      }`,
    ].join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");

  return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
