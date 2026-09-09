/**
 * Live "what's worth mentioning" signals for the storefront assistant:
 *   bestsellers  — top products by units sold in the trailing 30 days
 *   onSale       — products whose sale_price is currently below list price
 *   campaigns    — products linked to a marketing campaign that is running today
 *   hot          — the owner's "hot" badge, or a recent sales-velocity spike
 *
 * Each group is gated by the owner's per-signal toggle
 * (`storefront_assistant_config.signals`). Out-of-stock tracked products are
 * never surfaced.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";

export interface SignalToggles {
  bestseller: boolean;
  sale: boolean;
  campaign: boolean;
  hot: boolean;
}

export const DEFAULT_SIGNALS: SignalToggles = { bestseller: true, sale: true, campaign: true, hot: true };

export function normalizeSignals(raw: unknown): SignalToggles {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    bestseller: s.bestseller !== false,
    sale: s.sale !== false,
    campaign: s.campaign !== false,
    hot: s.hot !== false,
  };
}

export interface SignalProduct {
  name: string;
  handle: string;
  url: string;
  price: string;
  image: string | null;
  reason: string;
}

export interface StorefrontSignals {
  bestsellers: SignalProduct[];
  onSale: SignalProduct[];
  campaigns: { name: string; endsOn: string; products: SignalProduct[] }[];
  hot: SignalProduct[];
  any: boolean;
}

const DAY = 86_400_000;

interface Prod {
  id: string;
  name: string;
  slug: string;
  price: number;
  sale_price: number | null;
  is_hot: boolean;
  image_urls: string[];
  track_inventory: boolean;
  stock_qty: number;
}

export async function getStorefrontSignals(
  businessId: string,
  currency: string,
  basePath: string,
  toggles: SignalToggles,
): Promise<StorefrontSignals> {
  const db = getAdminSupabase();
  const empty: StorefrontSignals = { bestsellers: [], onSale: [], campaigns: [], hot: [], any: false };
  if (!toggles.bestseller && !toggles.sale && !toggles.campaign && !toggles.hot) return empty;

  const { data: rows } = await db
    .from("products")
    .select("id, name, slug, price, sale_price, is_hot, image_urls, track_inventory, stock_qty")
    .eq("business_id", businessId)
    .eq("status", "active")
    .eq("visible", true);

  const products = (rows ?? []) as unknown as Prod[];
  const byId = new Map(products.map((p) => [p.id, p]));
  const buyable = (p: Prod) => !p.track_inventory || Number(p.stock_qty) > 0;

  const card = (p: Prod, reason: string): SignalProduct => ({
    name: p.name,
    handle: p.slug,
    url: `${basePath}/products/${p.slug}`,
    price:
      p.sale_price != null && p.sale_price < p.price
        ? `${money(p.sale_price, currency)} (was ${money(p.price, currency)})`
        : money(p.price, currency),
    image: Array.isArray(p.image_urls) ? p.image_urls[0] ?? null : null,
    reason,
  });

  // ── sales history (30d units + 14d / prior-14d for velocity) ─────────────
  const needHistory = toggles.bestseller || toggles.hot;
  const units30 = new Map<string, number>();
  const units14 = new Map<string, number>();
  const unitsPrev14 = new Map<string, number>();
  if (needHistory && products.length) {
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const { data: items } = await db
      .from("order_items")
      .select("product_id, qty, orders!inner(placed_at, status, business_id)")
      .eq("business_id", businessId)
      .gte("orders.placed_at", since);
    const now = Date.now();
    for (const it of items ?? []) {
      const ord = (Array.isArray(it.orders) ? it.orders[0] : it.orders) as
        | { placed_at?: string; status?: string }
        | null;
      if (!ord || ord.status === "cancelled") continue;
      const pid = it.product_id as string;
      const q = Number(it.qty);
      units30.set(pid, (units30.get(pid) ?? 0) + q);
      const age = now - new Date(ord.placed_at as string).getTime();
      if (age <= 14 * DAY) units14.set(pid, (units14.get(pid) ?? 0) + q);
      else if (age <= 28 * DAY) unitsPrev14.set(pid, (unitsPrev14.get(pid) ?? 0) + q);
    }
  }

  // ── bestsellers ─────────────────────────────────────────────────────────
  let bestsellers: SignalProduct[] = [];
  if (toggles.bestseller) {
    bestsellers = [...units30.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => {
        const p = byId.get(id);
        return p && buyable(p) ? card(p, `${n} sold in the last 30 days`) : null;
      })
      .filter((x): x is SignalProduct => !!x);
  }

  // ── on sale ─────────────────────────────────────────────────────────────
  let onSale: SignalProduct[] = [];
  if (toggles.sale) {
    onSale = products
      .filter((p) => p.sale_price != null && p.sale_price < p.price && buyable(p))
      .sort((a, b) => (b.price - (b.sale_price ?? 0)) / b.price - (a.price - (a.sale_price ?? 0)) / a.price)
      .slice(0, 8)
      .map((p) => card(p, `${Math.round(((p.price - (p.sale_price as number)) / p.price) * 100)}% off`));
  }

  // ── running campaigns ───────────────────────────────────────────────────
  const campaigns: StorefrontSignals["campaigns"] = [];
  if (toggles.campaign) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: camps } = await db
      .from("campaigns")
      .select("id, name, ends_on")
      .eq("business_id", businessId)
      .eq("status", "running")
      .lte("starts_on", today)
      .gte("ends_on", today);
    for (const c of camps ?? []) {
      const { data: links } = await db
        .from("campaign_products")
        .select("product_id")
        .eq("business_id", businessId)
        .eq("campaign_id", c.id);
      const prods = (links ?? [])
        .map((l) => byId.get(l.product_id as string))
        .filter((p): p is Prod => !!p && buyable(p))
        .map((p) => card(p, `featured in the "${c.name}" campaign`));
      if (prods.length) campaigns.push({ name: c.name as string, endsOn: c.ends_on as string, products: prods });
    }
  }

  // ── hot / trending ──────────────────────────────────────────────────────
  let hot: SignalProduct[] = [];
  if (toggles.hot) {
    hot = products
      .filter((p) => {
        if (!buyable(p)) return false;
        if (p.is_hot) return true;
        const recent = units14.get(p.id) ?? 0;
        const prev = unitsPrev14.get(p.id) ?? 0;
        return recent >= 3 && recent >= 2 * Math.max(prev, 1);
      })
      .slice(0, 5)
      .map((p) => card(p, p.is_hot ? "marked as a featured product" : "selling fast this fortnight"));
  }

  const any =
    bestsellers.length > 0 || onSale.length > 0 || campaigns.length > 0 || hot.length > 0;
  return { bestsellers, onSale, campaigns, hot, any };
}
