import { getAdminSupabase } from "@/lib/supabase";
import { getSummary, buildMetricLines, type Summary } from "@/lib/metrics";
import { buildObservations, type Observation } from "@/lib/observations";
import { geminiGenerate, geminiConfigured, parseJsonResponse } from "@/lib/ai/gemini";
import { money, pctChange } from "@/lib/money";
import { sendReportReady } from "@/lib/emails";
import { getTrafficSummary } from "@/lib/traffic";

const DAY = 86_400_000;

/** Monday 00:00 of the week containing `d` (local-ish, UTC based). */
function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

export interface GenerateOptions {
  periodEnd?: Date; // defaults to the start of the current week (i.e. last full week)
  force?: boolean;
}

export interface GenerateResult {
  reportId: string;
  status: "ready" | "failed";
  aiModel: string | null;
}

interface AiNarrative {
  summary: string;
  insights: { title: string; detail: string; severity?: string }[];
  recommendations: { title: string; detail: string; effort?: string; impact?: string }[];
}

const SYSTEM = `You are the analyst for Zotomic, a business-intelligence tool for small online stores.
You are given ONLY pre-calculated figures and rule-based observations. Rules:
- Never invent, estimate, or alter any number. Use only the figures provided.
- Separate what is measured from what you infer. Keep inferences cautious.
- Be concise and plain. No hype, no emojis. Audience: a busy shop owner.
- Recommendations must be concrete and follow from the observations.
Return STRICT JSON: {"summary": string (2-3 sentences), "insights": [{"title": string, "detail": string, "severity": "info"|"low"|"medium"|"high"}], "recommendations": [{"title": string, "detail": string, "effort": "low"|"medium"|"high", "impact": "low"|"medium"|"high"}]}.`;

function factSheet(
  cur: Summary,
  prev: Summary,
  currency: string,
  observations: Observation[],
  top: { name: string; units: number; revenue: number }[],
): string {
  const line = (label: string, c: number | null, p: number | null, fmt: (n: number) => string) => {
    if (c == null) return `${label}: not available`;
    const d = p != null ? pctChange(c, p) : null;
    return `${label}: ${fmt(c)}${p != null ? ` (prev ${fmt(p)}${d != null ? `, ${d >= 0 ? "+" : ""}${d}%` : ""})` : ""}`;
  };
  const m = (n: number) => money(n, currency);
  const rr = (s: Summary) => {
    const d = s.orders_count + s.returned_count;
    return d ? (s.returned_count / d) * 100 : 0;
  };
  return [
    `Currency: ${currency}`,
    line("Revenue", cur.revenue, prev.revenue, m),
    line("Orders", cur.orders_count, prev.orders_count, (n) => String(n)),
    line("Units sold", cur.units, prev.units, (n) => String(n)),
    line("Average order value", cur.aov, prev.aov, m),
    cur.costs_complete
      ? line("Estimated profit", cur.estimated_profit, prev.costs_complete ? prev.estimated_profit : null, m)
      : "Estimated profit: not available (some products have no buying price)",
    `Cost of goods: ${m(cur.cogs)}; Marketing cost: ${m(cur.marketing)}`,
    line("Return rate %", Number(rr(cur).toFixed(1)), Number(rr(prev).toFixed(1)), (n) => `${n}%`),
    `New customers: ${cur.new_customers}`,
    "",
    "Top products (units, revenue):",
    ...top.map((t) => `- ${t.name}: ${t.units} units, ${m(t.revenue)}`),
    "",
    "Rule-based observations:",
    ...observations.map((o) => `- [${o.severity}] ${o.text}`),
  ].join("\n");
}

export async function generateReport(
  businessId: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const db = getAdminSupabase();

  const periodEnd = opts.periodEnd ?? weekStart(new Date());
  const periodStart = new Date(periodEnd.getTime() - 7 * DAY);
  const prevStart = new Date(periodStart.getTime() - 7 * DAY);
  const ps = periodStart.toISOString().slice(0, 10);
  const pe = periodEnd.toISOString().slice(0, 10);

  const { data: existing } = await db
    .from("reports")
    .select("id, status")
    .eq("business_id", businessId)
    .eq("period_start", ps)
    .eq("period_end", pe)
    .maybeSingle();

  if (existing?.status === "ready" && !opts.force) {
    return { reportId: existing.id, status: "ready", aiModel: null };
  }

  const { data: rpt } = await db
    .from("reports")
    .upsert(
      { business_id: businessId, period_start: ps, period_end: pe, status: "generating", error: null },
      { onConflict: "business_id,period_start,period_end" },
    )
    .select("id")
    .single();
  const reportId = rpt!.id as string;

  try {
    const { data: bizRow } = await db.from("businesses").select("currency").eq("id", businessId).single();
    const currency = (bizRow?.currency as string) ?? "BDT";

    const [cur, prev, topRes] = await Promise.all([
      getSummary(businessId, periodStart, periodEnd),
      getSummary(businessId, prevStart, periodStart),
      db.rpc("metrics_top_products", {
        p_business: businessId,
        p_start: periodStart.toISOString(),
        p_end: periodEnd.toISOString(),
        p_limit: 5,
      }),
    ]);

    const top = ((topRes.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      name: String(r.name ?? "Unknown"),
      units: Number(r.units ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));

    const lines = buildMetricLines(cur, prev);
    const observations = buildObservations(cur, prev, top, currency);

    // storefront traffic funnel
    const traffic = await getTrafficSummary(businessId, periodStart, periodEnd);
    if (traffic.hasData && traffic.visitors >= 10) {
      if (traffic.conversionRate != null) {
        observations.push({
          key: "conversion",
          severity: traffic.conversionRate < 1 ? "medium" : "info",
          text: `Storefront: ${traffic.visitors} visitors, ${traffic.purchases} purchases — ${traffic.conversionRate.toFixed(1)}% conversion.`,
        });
      }
      if (traffic.addToCart > 0 && traffic.purchases / traffic.addToCart < 0.4) {
        observations.push({
          key: "cart-abandon",
          severity: "medium",
          text: `${traffic.addToCart} add-to-cart events but only ${traffic.purchases} purchases — carts are being abandoned.`,
        });
      }
    }

    const coldStart = cur.orders_count === 0 && prev.orders_count === 0;

    // ── deterministic metrics rows ──────────────────────────────────────────
    await db.from("report_metrics").delete().eq("report_id", reportId);
    await db.from("report_metrics").insert(
      lines.map((l) => ({
        report_id: reportId,
        business_id: businessId,
        key: l.key,
        label: l.label,
        value: l.value,
        previous_value:
          l.key === "revenue" ? prev.revenue
          : l.key === "orders" ? prev.orders_count
          : l.key === "profit" ? prev.estimated_profit
          : null,
        change_pct: l.delta,
        direction: l.delta == null ? null : l.delta > 0 ? "up" : l.delta < 0 ? "down" : "flat",
        available: l.value != null,
        unavailable_reason: l.value == null ? l.unavailableReason ?? null : null,
      })),
    );

    // ── AI narrative (optional) ─────────────────────────────────────────────
    let summary: string;
    let aiModel: string | null = null;
    let aiInsights: AiNarrative["insights"] = [];
    let aiRecs: AiNarrative["recommendations"] = [];

    if (coldStart) {
      summary =
        "There isn't enough sales history yet to produce a full report. Add or import orders, or connect a data source, and the next weekly report will have real numbers to work with.";
    } else if (geminiConfigured()) {
      const sheet = factSheet(cur, prev, currency, observations, top);
      const ai = await geminiGenerate(
        `Here are this week's figures for the store. Write the weekly report.\n\n${sheet}`,
        { system: SYSTEM, json: true, maxOutputTokens: 2048 },
      );
      const parsed = ai ? parseJsonResponse<AiNarrative>(ai.text) : null;
      if (parsed?.summary) {
        summary = parsed.summary;
        aiModel = ai!.model;
        aiInsights = Array.isArray(parsed.insights) ? parsed.insights.slice(0, 6) : [];
        aiRecs = Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 5) : [];
      } else {
        summary = deterministicSummary(cur, prev, currency, observations);
      }
    } else {
      summary = deterministicSummary(cur, prev, currency, observations);
    }

    // ── insights ───────────────────────────────────────────────────────────
    await db.from("insights").delete().eq("report_id", reportId);
    const insightRows = (aiInsights.length
      ? aiInsights.map((i) => ({
          type: "ai",
          severity: (["info", "low", "medium", "high"].includes(i.severity ?? "") ? i.severity : "info") as string,
          title: i.title,
          body: i.detail,
        }))
      : observations.map((o) => ({ type: "rule", severity: o.severity, title: o.text, body: null }))
    ).map((r) => ({ ...r, report_id: reportId, business_id: businessId, evidence: {} }));
    if (insightRows.length) await db.from("insights").insert(insightRows);

    // ── recommendations ────────────────────────────────────────────────────
    await db.from("recommendations").delete().eq("report_id", reportId).eq("status", "open");
    if (aiRecs.length) {
      await db.from("recommendations").insert(
        aiRecs.map((r) => ({
          report_id: reportId,
          business_id: businessId,
          title: r.title,
          detail: r.detail,
          effort: ["low", "medium", "high"].includes(r.effort ?? "") ? r.effort : null,
          impact: ["low", "medium", "high"].includes(r.impact ?? "") ? r.impact : null,
          status: "open",
        })),
      );
    }

    // ── finalize ───────────────────────────────────────────────────────────
    await db
      .from("reports")
      .update({ status: "ready", summary, model: aiModel, generated_at: new Date().toISOString() })
      .eq("id", reportId);

    await db.from("notifications").insert({
      business_id: businessId,
      type: "report_ready",
      title: `Weekly report ready — ${ps} to ${pe}`,
      body: summary.slice(0, 160),
      href: "/app/intelligence",
    });

    try {
      const { data: bizRow } = await db.from("businesses").select("name").eq("id", businessId).single();
      const { data: owner } = await db
        .from("business_members")
        .select("users(email)")
        .eq("business_id", businessId)
        .eq("role", "owner")
        .maybeSingle();
      const email =
        ((Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { email?: string } | null)
          ?.email ?? "";
      if (email) {
        await sendReportReady({
          to: email,
          businessName: (bizRow?.name as string) ?? "your business",
          periodLabel: `${ps} to ${pe}`,
          summary,
        });
      }
    } catch (e) {
      console.error("report-ready email failed", (e as Error).message);
    }

    return { reportId, status: "ready", aiModel };
  } catch (e) {
    console.error("report generation failed", (e as Error).message);
    await db
      .from("reports")
      .update({ status: "failed", error: (e as Error).message.slice(0, 500) })
      .eq("id", reportId);
    return { reportId, status: "failed", aiModel: null };
  }
}

function deterministicSummary(
  cur: Summary,
  prev: Summary,
  currency: string,
  observations: Observation[],
): string {
  const revDelta = pctChange(cur.revenue, prev.revenue);
  const parts = [
    `Revenue was ${money(cur.revenue, currency)} across ${cur.orders_count} orders` +
      (revDelta != null ? `, ${revDelta >= 0 ? "up" : "down"} ${Math.abs(revDelta)}% on the previous week.` : "."),
  ];
  const high = observations.find((o) => o.severity === "high");
  if (high) parts.push(high.text);
  return parts.join(" ");
}
