import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { courierProvider, loadIntegration } from "@/lib/adapters/registry";

export const maxDuration = 120;

const TERMINAL = new Set(["delivered", "returned", "cancelled"]);

/** Poll couriers for status updates on open shipments. Triggered by pg_cron. */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminSupabase();
  const { data: shipments } = await db
    .from("shipments")
    .select("id, business_id, order_id, provider, consignment_id, status")
    .not("status", "in", `(${[...TERMINAL].join(",")})`)
    .not("consignment_id", "is", null)
    .limit(200);

  let updated = 0;
  const credCache = new Map<string, Awaited<ReturnType<typeof loadIntegration>>>();

  for (const sh of shipments ?? []) {
    const cacheKey = `${sh.business_id}:${sh.provider}`;
    if (!credCache.has(cacheKey)) credCache.set(cacheKey, await loadIntegration(sh.business_id as string, sh.provider as string));
    const integ = credCache.get(cacheKey);
    const provider = courierProvider(sh.provider as string);
    if (!integ || integ.status !== "connected" || !provider) continue;

    const res = await provider.getStatus(integ.creds, integ.mode, sh.consignment_id as string).catch(() => null);
    if (!res || res.status === sh.status) continue;

    await db.from("shipments").update({ status: res.status, raw: res.raw }).eq("id", sh.id);
    if (res.status === "delivered") {
      await db.from("orders").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", sh.order_id);
    } else if (res.status === "returned") {
      await db.from("orders").update({ status: "returned" }).eq("id", sh.order_id);
    }
    updated++;
  }

  return NextResponse.json({ checked: shipments?.length ?? 0, updated });
}
