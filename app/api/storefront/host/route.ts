import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

/** Middleware helper: which store (subdomain slug) owns this custom domain. */
export async function GET(req: Request) {
  const host = (new URL(req.url).searchParams.get("host") ?? "").trim().toLowerCase();
  if (!host) return NextResponse.json({ slug: null }, { status: 400 });

  const db = getAdminSupabase();
  const { data } = await db
    .from("storefront_config")
    .select("subdomain, custom_domain, custom_domain_status")
    .ilike("custom_domain", host)
    .eq("custom_domain_status", "active")
    .maybeSingle();

  return NextResponse.json(
    { slug: data?.subdomain ?? null },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
