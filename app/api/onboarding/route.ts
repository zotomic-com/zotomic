import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-server";
import { getAdminSupabase } from "@/lib/supabase";

const CURRENCIES = ["BDT", "USD", "INR", "PKR", "EUR", "GBP"];

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, type, currency, timezone } = await req.json();
  if (!name || String(name).trim().length < 2) {
    return NextResponse.json({ error: "Business name is required" }, { status: 400 });
  }

  const db = getAdminSupabase();

  // One business per owner in v1.
  const { data: existing } = await db
    .from("business_members")
    .select("business_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, businessId: existing.business_id, redirect: "/app" });
  }

  const base = slugify(name) || "store";
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const { data: taken } = await db.from("businesses").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: business, error: bErr } = await db
    .from("businesses")
    .insert({
      name: String(name).trim(),
      slug,
      type: type ?? null,
      currency: CURRENCIES.includes(currency) ? currency : "BDT",
      timezone: timezone || "Asia/Dhaka",
    })
    .select("id, name, slug, currency")
    .single();

  if (bErr || !business) {
    console.error("onboarding: business insert", bErr);
    return NextResponse.json({ error: "Could not create business" }, { status: 500 });
  }

  const bid = business.id;
  const results = await Promise.allSettled([
    db.from("business_members").insert({ business_id: bid, user_id: user.id, role: "owner", is_default: true }),
    db.from("subscriptions").insert({
      business_id: bid,
      plan: "free",
      status: "active",
      current_period_start: new Date().toISOString().slice(0, 10),
    }),
    db.from("storefront_config").insert({ business_id: bid, subdomain: slug }),
    db.from("audit_logs").insert({
      business_id: bid,
      actor_id: user.id,
      action: "business.created",
      target_type: "business",
      target_id: bid,
      summary: `Created business "${business.name}"`,
    }),
  ]);
  results.forEach((r) => r.status === "rejected" && console.error("onboarding sub-insert", r.reason));

  // Queue the first weekly report (last full week). The engine (Phase 3) picks
  // up rows with status 'queued'.
  const end = new Date();
  end.setDate(end.getDate() - end.getDay()); // last Sunday
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  await db.from("reports").insert({
    business_id: bid,
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
    status: "queued",
  });

  return NextResponse.json({ success: true, businessId: bid, redirect: "/app" });
}
