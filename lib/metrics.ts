import { getAdminSupabase } from "./supabase";
import { pctChange } from "./money";

export interface Summary {
  revenue: number;
  orders_count: number;
  returned_count: number;
  units: number;
  cogs: number;
  marketing: number;
  costs_complete: boolean;
  estimated_profit: number | null;
  aov: number;
  new_customers: number;
}

export interface MetricLine {
  key: string;
  label: string;
  value: number | null;
  /** signed % vs previous period; null = no baseline */
  delta: number | null;
  unavailableReason?: string;
  invert?: boolean;
}

function returnRate(s: Summary): number | null {
  const denom = s.orders_count + s.returned_count;
  return denom ? (s.returned_count / denom) * 100 : null;
}

export function buildMetricLines(cur: Summary, prev: Summary): MetricLine[] {
  const curRR = returnRate(cur);
  const prevRR = returnRate(prev);
  return [
    {
      key: "revenue",
      label: "Revenue",
      value: cur.revenue,
      delta: pctChange(cur.revenue, prev.revenue),
    },
    {
      key: "orders",
      label: "Orders",
      value: cur.orders_count,
      delta: pctChange(cur.orders_count, prev.orders_count),
    },
    {
      key: "profit",
      label: "Estimated Profit",
      value: cur.costs_complete ? cur.estimated_profit : null,
      delta:
        cur.costs_complete && prev.costs_complete && prev.estimated_profit
          ? pctChange(cur.estimated_profit ?? 0, prev.estimated_profit ?? 0)
          : null,
      unavailableReason: cur.costs_complete
        ? undefined
        : "Add buying price to every product to see profit",
    },
    {
      key: "returns",
      label: "Return Rate",
      value: curRR,
      delta: curRR != null && prevRR != null ? pctChange(curRR, prevRR) : null,
      invert: true,
    },
  ];
}

export interface DashboardData {
  current: Summary;
  previous: Summary;
  lines: MetricLine[];
  dailyRevenue: { day: string; revenue: number; orders: number }[];
  salesByCategory: { name: string; value: number }[];
  topProducts: { productId: string | null; name: string; units: number; revenue: number }[];
  periodStart: Date;
  periodEnd: Date;
}

const DAY = 86_400_000;

const numOrNull = (v: unknown) => (v == null ? null : Number(v));

export function rowToSummary(row: Record<string, unknown> | undefined): Summary {
  const empty: Summary = {
    revenue: 0, orders_count: 0, returned_count: 0, units: 0, cogs: 0,
    marketing: 0, costs_complete: true, estimated_profit: 0, aov: 0, new_customers: 0,
  };
  if (!row) return empty;
  return {
    revenue: Number(row.revenue ?? 0),
    orders_count: Number(row.orders_count ?? 0),
    returned_count: Number(row.returned_count ?? 0),
    units: Number(row.units ?? 0),
    cogs: Number(row.cogs ?? 0),
    marketing: Number(row.marketing ?? 0),
    costs_complete: Boolean(row.costs_complete),
    estimated_profit: numOrNull(row.estimated_profit),
    aov: Number(row.aov ?? 0),
    new_customers: Number(row.new_customers ?? 0),
  };
}

/** Deterministic summary for an explicit period. */
export async function getSummary(businessId: string, start: Date, end: Date): Promise<Summary> {
  const db = getAdminSupabase();
  const { data } = await db.rpc("metrics_summary", {
    p_business: businessId,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
  });
  return rowToSummary((data as Record<string, unknown>[] | null)?.[0]);
}

/** Deterministic dashboard metrics for the trailing 7 days vs the 7 before. */
export async function getDashboardData(businessId: string): Promise<DashboardData> {
  const db = getAdminSupabase();
  const end = new Date();
  const curStart = new Date(end.getTime() - 7 * DAY);
  const prevStart = new Date(end.getTime() - 14 * DAY);

  const iso = (d: Date) => d.toISOString();

  const [curRes, prevRes, dailyRes, catRes, topRes] = await Promise.all([
    db.rpc("metrics_summary", { p_business: businessId, p_start: iso(curStart), p_end: iso(end) }),
    db.rpc("metrics_summary", { p_business: businessId, p_start: iso(prevStart), p_end: iso(curStart) }),
    db.rpc("metrics_daily_revenue", { p_business: businessId, p_start: iso(curStart), p_end: iso(end) }),
    db.rpc("metrics_sales_by_category", { p_business: businessId, p_start: iso(curStart), p_end: iso(end) }),
    db.rpc("metrics_top_products", { p_business: businessId, p_start: iso(curStart), p_end: iso(end), p_limit: 5 }),
  ]);

  const current = rowToSummary((curRes.data as Record<string, unknown>[] | null)?.[0]);
  const previous = rowToSummary((prevRes.data as Record<string, unknown>[] | null)?.[0]);

  const dailyRevenue = ((dailyRes.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    day: new Date(r.day as string).toLocaleDateString("en-US", { weekday: "short" }),
    revenue: Number(r.revenue ?? 0),
    orders: Number(r.orders_count ?? 0),
  }));

  const salesByCategory = ((catRes.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    name: String(r.category ?? "Uncategorised"),
    value: Number(r.revenue ?? 0),
  }));

  const topProducts = ((topRes.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    productId: (r.product_id as string) ?? null,
    name: String(r.name ?? "Unknown"),
    units: Number(r.units ?? 0),
    revenue: Number(r.revenue ?? 0),
  }));

  return {
    current,
    previous,
    lines: buildMetricLines(current, previous),
    dailyRevenue,
    salesByCategory,
    topProducts,
    periodStart: curStart,
    periodEnd: end,
  };
}
