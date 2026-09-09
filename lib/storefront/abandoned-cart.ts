/**
 * Abandoned-cart analytics from `storefront_events`.
 *
 * The storefront cart lives only in the shopper's localStorage — nothing is
 * stored server-side — so "abandonment" is derived from events: sessions that
 * fired `add_to_cart` / `begin_checkout` but produced no order.
 *
 * Purchase events carry no session id, so matching is done at the aggregate
 * level: (distinct cart sessions) − (orders placed) = abandoned carts.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";

const HOUR = 3_600_000;
const DAY = 86_400_000;

export interface AbandonedCartSummary {
  start: string;
  end: string;
  cartSessions: number;        // distinct sessions with add_to_cart
  checkoutSessions: number;    // distinct sessions that reached begin_checkout
  registeredCartSessions: number; // of those, from a signed-in shopper
  orders: number;             // non-cancelled orders placed in the window
  abandonedCarts: number;
  abandonedCheckouts: number;
  cartAbandonRate: number | null;      // % of cart sessions that didn't order
  checkoutAbandonRate: number | null;  // % of checkout sessions that didn't order
  avgCartValue: number;
  estimatedLostValue: number;          // abandonedCarts × avgCartValue
  hasData: boolean;
}

export interface CartShopper {
  type: "guest" | "registered";
  name?: string;
  phone?: string | null;
  email?: string | null;
}

export interface RecentCart {
  session: string;              // short, non-identifying
  lastActivity: string;
  minutesIdle: number;
  reachedCheckout: boolean;
  items: number;                // add_to_cart events in the session
  value: number;                // summed add_to_cart value
  likelyAbandoned: boolean;     // idle > 60 min
  shopper: CartShopper;
}

async function loadCartEvents(businessId: string, since: Date) {
  const db = getAdminSupabase();
  const { data } = await db
    .from("storefront_events")
    .select("type, session_id, store_account_id, value, created_at")
    .eq("business_id", businessId)
    .in("type", ["add_to_cart", "begin_checkout"])
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true })
    .limit(30_000);
  return data ?? [];
}

export async function getAbandonedCartSummary(
  businessId: string,
  start: Date,
  end: Date,
): Promise<AbandonedCartSummary> {
  const db = getAdminSupabase();
  const [events, { data: orders }] = await Promise.all([
    loadCartEvents(businessId, start),
    db
      .from("orders")
      .select("total, status, placed_at")
      .eq("business_id", businessId)
      .gte("placed_at", start.toISOString())
      .lt("placed_at", end.toISOString()),
  ]);

  const inWindow = events.filter(
    (e) => (e.created_at as string) >= start.toISOString() && (e.created_at as string) < end.toISOString(),
  );

  const cartSet = new Set<string>();
  const checkoutSet = new Set<string>();
  const registeredSet = new Set<string>();
  let addValueTotal = 0;
  let addValueCount = 0;
  for (const e of inWindow) {
    const sid = (e.session_id as string) || "";
    if (!sid) continue;
    if (e.store_account_id) registeredSet.add(sid);
    if (e.type === "add_to_cart") {
      cartSet.add(sid);
      if (typeof e.value === "number") {
        addValueTotal += Number(e.value);
        addValueCount += 1;
      }
    } else if (e.type === "begin_checkout") {
      checkoutSet.add(sid);
    }
  }

  const orderRows = (orders ?? []).filter((o) => o.status !== "cancelled");
  const orderCount = orderRows.length;

  const cartSessions = cartSet.size;
  const checkoutSessions = checkoutSet.size;
  const abandonedCarts = Math.max(0, cartSessions - orderCount);
  const abandonedCheckouts = Math.max(0, checkoutSessions - orderCount);
  const avgCartValue = addValueCount ? Math.round(addValueTotal / cartSessions || 0) : 0;

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    cartSessions,
    checkoutSessions,
    registeredCartSessions: registeredSet.size,
    orders: orderCount,
    abandonedCarts,
    abandonedCheckouts,
    cartAbandonRate: cartSessions ? Math.round((abandonedCarts / cartSessions) * 100) : null,
    checkoutAbandonRate: checkoutSessions ? Math.round((abandonedCheckouts / checkoutSessions) * 100) : null,
    avgCartValue,
    estimatedLostValue: Math.round(abandonedCarts * avgCartValue),
    hasData: cartSessions > 0 || orderCount > 0,
  };
}

/**
 * Per-session cart activity for the last `days` days (owner detail list).
 * When `withIdentity` is true, signed-in shoppers are resolved to name / phone /
 * email; guests stay anonymous. Only for paid plans (the caller gates this).
 */
export async function getRecentCarts(
  businessId: string,
  days = 7,
  limit = 25,
  withIdentity = true,
): Promise<RecentCart[]> {
  const since = new Date(Date.now() - days * DAY);
  const events = await loadCartEvents(businessId, since);

  const bySession = new Map<
    string,
    { last: number; reachedCheckout: boolean; items: number; value: number; accountId: string | null }
  >();
  for (const e of events) {
    const sid = (e.session_id as string) || "";
    if (!sid) continue;
    const t = new Date(e.created_at as string).getTime();
    const cur = bySession.get(sid) ?? { last: 0, reachedCheckout: false, items: 0, value: 0, accountId: null };
    cur.last = Math.max(cur.last, t);
    if (e.store_account_id) cur.accountId = e.store_account_id as string;
    if (e.type === "begin_checkout") cur.reachedCheckout = true;
    if (e.type === "add_to_cart") {
      cur.items += 1;
      if (typeof e.value === "number") cur.value += Number(e.value);
    }
    bySession.set(sid, cur);
  }

  // resolve signed-in shoppers
  const accounts = new Map<string, { name: string; phone: string | null; email: string | null }>();
  if (withIdentity) {
    const ids = [...new Set([...bySession.values()].map((v) => v.accountId).filter(Boolean))] as string[];
    if (ids.length) {
      const { data } = await getAdminSupabase()
        .from("store_accounts")
        .select("id, name, phone, email")
        .in("id", ids);
      for (const a of data ?? [])
        accounts.set(a.id as string, { name: (a.name as string) || "Customer", phone: (a.phone as string) ?? null, email: (a.email as string) ?? null });
    }
  }

  const now = Date.now();
  return [...bySession.entries()]
    .map(([sid, v]) => {
      const idle = now - v.last;
      const acct = v.accountId ? accounts.get(v.accountId) : null;
      const shopper: CartShopper = acct
        ? { type: "registered", name: acct.name, phone: acct.phone, email: acct.email }
        : v.accountId && withIdentity
          ? { type: "registered", name: "Registered customer" }
          : { type: "guest" };
      return {
        session: sid.slice(-6),
        lastActivity: new Date(v.last).toISOString(),
        minutesIdle: Math.round(idle / 60_000),
        reachedCheckout: v.reachedCheckout,
        items: v.items,
        value: Math.round(v.value),
        likelyAbandoned: idle > HOUR,
        shopper,
      };
    })
    .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
    .slice(0, limit);
}
