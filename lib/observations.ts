import type { DashboardData } from "./metrics";
import { money, pctChange } from "./money";

export interface Observation {
  severity: "info" | "low" | "medium" | "high";
  text: string;
}

/**
 * Rule-based observations derived purely from the calculated metrics.
 * These are deterministic facts, not AI interpretation — the weekly report
 * (Phase 3) adds the narrative on top.
 */
export function buildObservations(data: DashboardData, currency: string): Observation[] {
  const { current: c, previous: p } = data;
  const out: Observation[] = [];

  if (c.orders_count === 0) {
    out.push({ severity: "info", text: "No orders in the last 7 days." });
    return out;
  }

  const revDelta = pctChange(c.revenue, p.revenue);
  if (revDelta != null) {
    out.push({
      severity: Math.abs(revDelta) >= 25 ? "medium" : "info",
      text: `Revenue ${revDelta >= 0 ? "rose" : "fell"} ${Math.abs(revDelta)}% versus the previous week (${money(
        c.revenue,
        currency,
      )} vs ${money(p.revenue, currency)}).`,
    });
  }

  if (c.costs_complete && p.costs_complete && c.estimated_profit != null && p.estimated_profit != null) {
    const profitDelta = pctChange(c.estimated_profit, p.estimated_profit);
    if (profitDelta != null && revDelta != null && Math.sign(profitDelta) !== Math.sign(revDelta)) {
      out.push({
        severity: "high",
        text: `Profit moved the opposite way to revenue — profit ${
          profitDelta >= 0 ? "up" : "down"
        } ${Math.abs(profitDelta)}% while revenue went ${revDelta >= 0 ? "up" : "down"}. Check buying and marketing costs.`,
      });
    }
  } else if (!c.costs_complete) {
    out.push({
      severity: "low",
      text: "Profit can't be calculated — some sold products have no buying price.",
    });
  }

  const rr = c.returned_count / (c.orders_count + c.returned_count);
  if (rr >= 0.1) {
    out.push({
      severity: rr >= 0.2 ? "high" : "medium",
      text: `Return rate is ${(rr * 100).toFixed(1)}% (${c.returned_count} of ${
        c.orders_count + c.returned_count
      } orders).`,
    });
  }

  const top = data.topProducts[0];
  if (top && c.revenue > 0) {
    const share = Math.round((top.revenue / c.revenue) * 100);
    if (share >= 40) {
      out.push({
        severity: "low",
        text: `${top.name} drove ${share}% of revenue this week — the catalog is concentrated.`,
      });
    }
  }

  return out;
}
