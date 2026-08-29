import type { Summary } from "./metrics";
import { money, pctChange } from "./money";

export interface Observation {
  key: string;
  severity: "info" | "low" | "medium" | "high";
  text: string;
}

export interface TopProduct {
  name: string;
  revenue: number;
}

/**
 * Rule-based observations derived purely from the calculated metrics.
 * Deterministic facts, not AI interpretation — the weekly report adds the
 * narrative on top of these.
 */
export function buildObservations(
  current: Summary,
  previous: Summary,
  topProducts: TopProduct[],
  currency: string,
): Observation[] {
  const c = current;
  const p = previous;
  const out: Observation[] = [];

  if (c.orders_count === 0) {
    out.push({ key: "no-orders", severity: "info", text: "No orders were recorded in this period." });
    return out;
  }

  const revDelta = pctChange(c.revenue, p.revenue);
  if (revDelta != null) {
    out.push({
      key: "revenue",
      severity: Math.abs(revDelta) >= 25 ? "medium" : "info",
      text: `Revenue ${revDelta >= 0 ? "rose" : "fell"} ${Math.abs(revDelta)}% versus the previous period (${money(
        c.revenue,
        currency,
      )} vs ${money(p.revenue, currency)}).`,
    });
  }

  if (c.costs_complete && p.costs_complete && c.estimated_profit != null && p.estimated_profit != null) {
    const profitDelta = pctChange(c.estimated_profit, p.estimated_profit);
    if (profitDelta != null && revDelta != null && Math.sign(profitDelta) !== Math.sign(revDelta)) {
      out.push({
        key: "profit-divergence",
        severity: "high",
        text: `Profit moved opposite to revenue — profit ${profitDelta >= 0 ? "up" : "down"} ${Math.abs(
          profitDelta,
        )}% while revenue went ${revDelta >= 0 ? "up" : "down"} ${Math.abs(revDelta)}%. Check buying and marketing costs.`,
      });
    }
  } else if (!c.costs_complete) {
    out.push({
      key: "missing-costs",
      severity: "low",
      text: "Profit could not be calculated — some sold products have no buying price.",
    });
  }

  const denom = c.orders_count + c.returned_count;
  const rr = denom ? c.returned_count / denom : 0;
  if (rr >= 0.1) {
    out.push({
      key: "returns",
      severity: rr >= 0.2 ? "high" : "medium",
      text: `Return rate was ${(rr * 100).toFixed(1)}% (${c.returned_count} of ${denom} orders).`,
    });
  }

  const orderDelta = pctChange(c.orders_count, p.orders_count);
  const aovDelta = pctChange(c.aov, p.aov);
  if (orderDelta != null && aovDelta != null && Math.abs(orderDelta) >= 15 && Math.abs(aovDelta) >= 15) {
    out.push({
      key: "orders-aov",
      severity: "low",
      text: `Order count ${orderDelta >= 0 ? "up" : "down"} ${Math.abs(orderDelta)}% and average order value ${
        aovDelta >= 0 ? "up" : "down"
      } ${Math.abs(aovDelta)}%.`,
    });
  }

  const top = topProducts[0];
  if (top && c.revenue > 0) {
    const share = Math.round((top.revenue / c.revenue) * 100);
    if (share >= 40) {
      out.push({
        key: "concentration",
        severity: "low",
        text: `${top.name} drove ${share}% of revenue — the catalogue is concentrated in one product.`,
      });
    }
  }

  return out;
}
