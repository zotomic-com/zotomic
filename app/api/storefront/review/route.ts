import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { revalidateTag } from "next/cache";

const clean = (v: unknown, n = 2000) => String(v ?? "").trim().slice(0, n);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = clean(body?.token, 64);
  const rating = Math.round(Number(body?.rating));
  if (!token || !(rating >= 1 && rating <= 5)) {
    return NextResponse.json({ error: "A rating is required." }, { status: 400 });
  }

  const db = getAdminSupabase();
  const { data: tok } = await db
    .from("review_tokens")
    .select("token, business_id, order_id, product_id, customer_id, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!tok) return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  if (tok.used_at) return NextResponse.json({ error: "This review link has already been used." }, { status: 409 });

  let reviewerName = clean(body?.name, 80);
  if (!reviewerName && tok.customer_id) {
    const { data: c } = await db.from("customers").select("name").eq("id", tok.customer_id).maybeSingle();
    reviewerName = clean(c?.name, 80);
  }

  await db.from("product_reviews").insert({
    business_id: tok.business_id,
    product_id: tok.product_id,
    order_id: tok.order_id,
    customer_id: tok.customer_id,
    rating,
    title: clean(body?.title, 120) || null,
    body: clean(body?.body, 2000) || null,
    reviewer_name: reviewerName || "Verified buyer",
    status: "pending",
  });

  await db.from("review_tokens").update({ used_at: new Date().toISOString() }).eq("token", token);
  revalidateTag(`site:${tok.business_id}`);

  return NextResponse.json({ ok: true });
}
