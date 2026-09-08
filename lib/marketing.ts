/**
 * Campaign attribution (item 10). Deterministic only: for a campaign's date
 * window we count every non-cancelled sale of its linked products. We do NOT
 * try to isolate ad-driven sales — the UI/report states this limitation plainly.
 */
import { getAdminSupabase } from "@/lib/supabase";
import { usdToBdt } from "@/lib/fx";

export interface CampaignRow {
  id: string;
  name: string;
  status: string;
  budget_usd: number;
  spend_usd: number | null;
  starts_on: string;
  ends_on: string;
  fx_rate: number | null;
  fx_at: string | null;
  notes: string | null;
}

export interface CampaignAttribution {
  productIds: string[];
  productNames: string[];
  units: number;
  revenueBdt: number;
  spendUsd: number;
  spendBdt: number;
  fxRate: number;
  costPerUnitBdt: number | null;
  roas: number | null;
  windowDays: number;
  finalised: boolean; // actual spend entered
}

export async function getCampaignAttribution(
  businessId: string,
  c: CampaignRow,
  currentFx: number,
): Promise<CampaignAttribution> {
  const db = getAdminSupabase();

  const { data: links } = await db
    .from("campaign_products")
    .select("product_id, products(name)")
    .eq("business_id", businessId)
    .eq("campaign_id", c.id);
  const productIds = (links ?? []).map((l) => l.product_id as string);
  const productNames = (links ?? []).map(
    (l) => ((Array.isArray(l.products) ? l.products[0] : l.products) as { name?: string } | null)?.name ?? "—",
  );

  let units = 0;
  let revenueBdt = 0;
  if (productIds.length) {
    const startIso = `${c.starts_on}T00:00:00Z`;
    const endIso = `${c.ends_on}T23:59:59Z`;
    const { data: items } = await db
      .from("order_items")
      .select("qty, line_total, orders!inner(placed_at, status, business_id)")
      .eq("business_id", businessId)
      .in("product_id", productIds)
      .gte("orders.placed_at", startIso)
      .lte("orders.placed_at", endIso);
    for (const it of items ?? []) {
      const ord = (Array.isArray(it.orders) ? it.orders[0] : it.orders) as { status?: string } | null;
      if (ord?.status === "cancelled") continue;
      units += Number(it.qty);
      revenueBdt += Number(it.line_total);
    }
  }

  const finalised = c.spend_usd != null;
  const spendUsd = finalised ? Number(c.spend_usd) : Number(c.budget_usd);
  const fxRate = c.fx_rate ?? currentFx;
  const spendBdt = usdToBdt(spendUsd, fxRate);

  const start = new Date(c.starts_on);
  const end = new Date(c.ends_on);
  const windowDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

  return {
    productIds,
    productNames,
    units,
    revenueBdt: Math.round(revenueBdt),
    spendUsd,
    spendBdt,
    fxRate,
    costPerUnitBdt: units > 0 ? Math.round(spendBdt / units) : null,
    roas: spendBdt > 0 ? Math.round((revenueBdt / spendBdt) * 100) / 100 : null,
    windowDays,
    finalised,
  };
}

/** Campaigns whose window overlaps [start, end] — for the weekly report section. */
export async function campaignsInWindow(businessId: string, start: Date, end: Date): Promise<CampaignRow[]> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("campaigns")
    .select("id, name, status, budget_usd, spend_usd, starts_on, ends_on, fx_rate, fx_at, notes")
    .eq("business_id", businessId)
    .lte("starts_on", end.toISOString().slice(0, 10))
    .gte("ends_on", start.toISOString().slice(0, 10))
    .order("starts_on", { ascending: false });
  return (data ?? []) as CampaignRow[];
}
