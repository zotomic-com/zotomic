import { NextResponse } from "next/server";
import { getStoreBySlug } from "@/lib/storefront/store";
import { getAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: current stock for a set of product / variant ids (cart + checkout). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("store") ?? "";
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (!slug || !ids.length) return NextResponse.json({ stock: {} });

  const store = await getStoreBySlug(slug);
  if (!store || !store.published) return NextResponse.json({ stock: {} });

  const db = getAdminSupabase();
  const [{ data: products }, { data: variants }] = await Promise.all([
    db.from("products").select("id, stock_qty, track_inventory").eq("business_id", store.businessId).in("id", ids),
    db.from("product_variants").select("id, stock_qty").eq("business_id", store.businessId).in("id", ids),
  ]);

  const stock: Record<string, { stock: number; tracked: boolean }> = {};
  for (const p of products ?? []) {
    stock[p.id as string] = { stock: Number(p.stock_qty ?? 0), tracked: !!p.track_inventory };
  }
  for (const v of variants ?? []) {
    stock[v.id as string] = { stock: Number(v.stock_qty ?? 0), tracked: true };
  }

  return NextResponse.json({ stock }, { headers: { "cache-control": "no-store" } });
}
