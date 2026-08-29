import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";

const TYPES = new Set(["page_view", "product_view", "add_to_cart", "add_to_wishlist", "begin_checkout"]);

/** Lightweight storefront analytics → storefront_events (feeds the intelligence layer). */
export async function POST(req: NextRequest) {
  let b: { storeSlug?: string; type?: string; path?: string; productId?: string; value?: number; sessionId?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!b.storeSlug || !b.type || !TYPES.has(b.type)) return NextResponse.json({ ok: false }, { status: 400 });

  const db = getAdminSupabase();
  const { data: cfg } = await db
    .from("storefront_config")
    .select("business_id")
    .eq("subdomain", b.storeSlug)
    .maybeSingle();
  if (!cfg) return NextResponse.json({ ok: false }, { status: 404 });

  await db.from("storefront_events").insert({
    business_id: cfg.business_id,
    session_id: (b.sessionId ?? "").slice(0, 64) || null,
    type: b.type,
    path: (b.path ?? "").slice(0, 200) || null,
    product_id: b.productId ?? null,
    value: typeof b.value === "number" ? b.value : null,
  });

  return NextResponse.json({ ok: true });
}
