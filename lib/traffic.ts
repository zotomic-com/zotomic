import { getAdminSupabase } from "@/lib/supabase";

export interface TrafficSummary {
  visitors: number; // distinct sessions with a page_view
  pageViews: number;
  productViews: number;
  addToCart: number;
  beginCheckout: number;
  purchases: number;
  /** purchases / visitors, % */
  conversionRate: number | null;
  hasData: boolean;
}

export async function getTrafficSummary(businessId: string, start: Date, end: Date): Promise<TrafficSummary> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("storefront_events")
    .select("type, session_id")
    .eq("business_id", businessId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .limit(20000);

  const rows = data ?? [];
  const count = (t: string) => rows.filter((r) => r.type === t).length;
  const sessions = new Set(rows.filter((r) => r.type === "page_view" && r.session_id).map((r) => r.session_id));
  const visitors = sessions.size;
  const purchases = count("purchase");

  return {
    visitors,
    pageViews: count("page_view"),
    productViews: count("product_view"),
    addToCart: count("add_to_cart"),
    beginCheckout: count("begin_checkout"),
    purchases,
    conversionRate: visitors > 0 ? (purchases / visitors) * 100 : null,
    hasData: rows.length > 0,
  };
}
