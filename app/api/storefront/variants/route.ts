import { NextResponse } from "next/server";
import { getStoreBySlug, getStoreProduct, getStoreProductVariants } from "@/lib/storefront/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: active variants for one product, used by the storefront quick-add. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("store") ?? "";
  const handle = url.searchParams.get("handle") ?? "";
  if (!slug || !handle) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const store = await getStoreBySlug(slug);
  if (!store || !store.published) return NextResponse.json({ error: "Unavailable" }, { status: 404 });

  const product = await getStoreProduct(store.businessId, handle);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { options, variants } = await getStoreProductVariants(store.businessId, product.id, product.price);
  return NextResponse.json(
    { options, variants },
    { headers: { "cache-control": "public, max-age=60, s-maxage=120" } },
  );
}
