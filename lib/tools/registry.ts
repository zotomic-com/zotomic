import { getSummary, buildMetricLines } from "@/lib/metrics";
import { buildObservations } from "@/lib/observations";
import { money } from "@/lib/money";
import { deliverReportEmail, deliverReportTelegram } from "@/lib/reports/deliver";
import type { ToolContext, ToolDef } from "./types";

const DAY = 86_400_000;
const s = (v: unknown) => (typeof v === "string" ? v : undefined);
const n = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : undefined);

function periodRange(period?: string): { start: Date; end: Date; label: string } {
  const end = new Date();
  const map: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };
  const days = map[period ?? "7d"] ?? 7;
  return { start: new Date(end.getTime() - days * DAY), end, label: `last ${days} days` };
}

// ── read tools ─────────────────────────────────────────────────────────────

const get_business_profile: ToolDef = {
  name: "get_business_profile",
  description: "The authenticated business's identity and profile: name, type, currency, timezone, description, slug.",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: {} },
  async handler(ctx) {
    const { data } = await ctx.db
      .from("businesses")
      .select("name, type, currency, timezone, description, slug, created_at")
      .eq("id", ctx.businessId)
      .single();
    return data;
  },
};

const get_business_settings: ToolDef = {
  name: "get_business_settings",
  description: "Business preferences: currency, timezone, storefront publish status, subscription plan and status.",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: {} },
  async handler(ctx) {
    const [{ data: biz }, { data: sub }, { data: sf }] = await Promise.all([
      ctx.db.from("businesses").select("currency, timezone").eq("id", ctx.businessId).single(),
      ctx.db.from("subscriptions").select("plan, status, current_period_end").eq("business_id", ctx.businessId).maybeSingle(),
      ctx.db.from("storefront_config").select("published_at, subdomain").eq("business_id", ctx.businessId).maybeSingle(),
    ]);
    return {
      currency: biz?.currency,
      timezone: biz?.timezone,
      plan: sub?.plan ?? "free",
      subscriptionStatus: sub?.status ?? "active",
      renewsOn: sub?.current_period_end ?? null,
      storefrontPublished: !!sf?.published_at,
      storefrontUrl: sf?.subdomain ? `${sf.subdomain}.${process.env.STOREFRONT_ROOT_DOMAIN ?? "zotomic.com"}` : null,
    };
  },
};

const list_products: ToolDef = {
  name: "list_products",
  description: "Search/filter the business's products. Returns compact records.",
  risk: "read",
  creditCost: 0,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "text to match in name/category" },
      status: { type: "string", enum: ["active", "draft", "archived"] },
      lowStock: { type: "boolean", description: "only products with stock < 10 (tracked)" },
      limit: { type: "number" },
    },
  },
  async handler(ctx, a) {
    let q = ctx.db
      .from("products")
      .select("id, name, category, status, price, buying_price, stock_qty, track_inventory")
      .eq("business_id", ctx.businessId)
      .limit(Math.min(n(a.limit) ?? 25, 50));
    if (s(a.status)) q = q.eq("status", s(a.status)!);
    if (s(a.query)) q = q.or(`name.ilike.%${s(a.query)}%,category.ilike.%${s(a.query)}%`);
    const { data } = await q;
    let rows = data ?? [];
    if (a.lowStock === true) rows = rows.filter((p) => p.track_inventory && Number(p.stock_qty) < 10);
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      status: p.status,
      price: money(Number(p.price), ctx.currency),
      hasCost: p.buying_price != null,
      stock: p.track_inventory ? p.stock_qty : "not tracked",
    }));
  },
};

const get_product: ToolDef = {
  name: "get_product",
  description: "Full detail for one product owned by the business, including cost, stock, and 30-day sales.",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: { productId: { type: "string" } }, required: ["productId"] },
  async handler(ctx, a) {
    const id = s(a.productId);
    if (!id) return { error: "productId required" };
    const { data: p } = await ctx.db
      .from("products")
      .select("id, name, slug, description, status, category, price, sale_price, buying_price, marketing_cost, stock_qty, track_inventory")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (!p) return { error: "Product not found" };
    const { data: items } = await ctx.db
      .from("order_items")
      .select("qty, line_total, orders!inner(placed_at, status, business_id)")
      .eq("business_id", ctx.businessId)
      .eq("product_id", id)
      .gte("orders.placed_at", new Date(Date.now() - 30 * DAY).toISOString());
    const sold = (items ?? []).reduce((x, i) => x + Number(i.qty), 0);
    const rev = (items ?? []).reduce((x, i) => x + Number(i.line_total), 0);
    return {
      ...p,
      price: money(Number(p.price), ctx.currency),
      buyingPrice: p.buying_price != null ? money(Number(p.buying_price), ctx.currency) : null,
      last30Days: { unitsSold: sold, revenue: money(rev, ctx.currency) },
    };
  },
};

const search_orders: ToolDef = {
  name: "search_orders",
  description: "Search the business's orders by status and/or date range.",
  risk: "read",
  creditCost: 0,
  parameters: {
    type: "object",
    properties: {
      status: { type: "string" },
      sinceDays: { type: "number", description: "orders placed in the last N days" },
      limit: { type: "number" },
    },
  },
  async handler(ctx, a) {
    let q = ctx.db
      .from("orders")
      .select("order_number, status, payment_method, total, placed_at, customers(name)")
      .eq("business_id", ctx.businessId)
      .order("placed_at", { ascending: false })
      .limit(Math.min(n(a.limit) ?? 20, 50));
    if (s(a.status)) q = q.eq("status", s(a.status)!);
    if (n(a.sinceDays)) q = q.gte("placed_at", new Date(Date.now() - n(a.sinceDays)! * DAY).toISOString());
    const { data } = await q;
    return (data ?? []).map((o) => ({
      order: o.order_number,
      status: o.status,
      payment: o.payment_method,
      total: money(Number(o.total), ctx.currency),
      placedAt: o.placed_at,
      customer: (Array.isArray(o.customers) ? o.customers[0] : o.customers)?.name ?? "Guest",
    }));
  },
};

const get_order_summary: ToolDef = {
  name: "get_order_summary",
  description: "Pre-computed aggregate order metrics for a period: count, revenue, AOV, returns.",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: { period: { type: "string", enum: ["7d", "14d", "30d", "90d"] } } },
  async handler(ctx, a) {
    const { start, end, label } = periodRange(s(a.period));
    const sum = await getSummary(ctx.businessId, start, end);
    return {
      period: label,
      orders: sum.orders_count,
      revenue: money(sum.revenue, ctx.currency),
      averageOrderValue: money(sum.aov, ctx.currency),
      returnedOrders: sum.returned_count,
      unitsSold: sum.units,
    };
  },
};

const search_customers: ToolDef = {
  name: "search_customers",
  description: "Search the business's customers. Returns minimal fields (name, city, order count, total spent).",
  risk: "read",
  creditCost: 0,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      repeatOnly: { type: "boolean", description: "only customers with more than one order" },
      limit: { type: "number" },
    },
  },
  async handler(ctx, a) {
    let q = ctx.db
      .from("customers")
      .select("name, city, total_orders, total_spent, last_order_at")
      .eq("business_id", ctx.businessId)
      .order("total_spent", { ascending: false })
      .limit(Math.min(n(a.limit) ?? 20, 50));
    if (s(a.query)) q = q.ilike("name", `%${s(a.query)}%`);
    if (a.repeatOnly === true) q = q.gt("total_orders", 1);
    const { data } = await q;
    return (data ?? []).map((c) => ({
      name: c.name,
      city: c.city,
      orders: c.total_orders,
      totalSpent: money(Number(c.total_spent ?? 0), ctx.currency),
      lastOrder: c.last_order_at,
    }));
  },
};

const get_customer_summary: ToolDef = {
  name: "get_customer_summary",
  description: "Aggregate customer metrics for a period: new vs repeat customers, total customers, average spend.",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: { period: { type: "string", enum: ["7d", "14d", "30d", "90d"] } } },
  async handler(ctx, a) {
    const { start, end, label } = periodRange(s(a.period));
    const { data: all } = await ctx.db
      .from("customers")
      .select("total_orders, total_spent, first_order_at")
      .eq("business_id", ctx.businessId);
    const rows = all ?? [];
    const newInPeriod = rows.filter(
      (c) => c.first_order_at && new Date(c.first_order_at as string) >= start && new Date(c.first_order_at as string) < end,
    ).length;
    const repeat = rows.filter((c) => Number(c.total_orders) > 1).length;
    const spend = rows.reduce((x, c) => x + Number(c.total_spent ?? 0), 0);
    return {
      period: label,
      totalCustomers: rows.length,
      newCustomers: newInPeriod,
      repeatCustomers: repeat,
      averageLifetimeSpend: money(rows.length ? spend / rows.length : 0, ctx.currency),
    };
  },
};

const get_business_metrics: ToolDef = {
  name: "get_business_metrics",
  description: "Authoritative business metrics for a period vs the period before: revenue, orders, estimated profit, return rate — all with % change. These numbers are calculated deterministically; use them as-is.",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: { period: { type: "string", enum: ["7d", "14d", "30d"] } } },
  async handler(ctx, a) {
    const days = { "7d": 7, "14d": 14, "30d": 30 }[s(a.period) ?? "7d"] ?? 7;
    const end = new Date();
    const cur = new Date(end.getTime() - days * DAY);
    const prev = new Date(end.getTime() - 2 * days * DAY);
    const [c, p] = await Promise.all([getSummary(ctx.businessId, cur, end), getSummary(ctx.businessId, prev, cur)]);
    const lines = buildMetricLines(c, p);
    return {
      period: `last ${days} days`,
      metrics: lines.map((l) => ({
        name: l.label,
        value:
          l.value == null
            ? "not available"
            : l.key === "returns"
              ? `${l.value.toFixed(1)}%`
              : l.key === "revenue" || l.key === "profit"
                ? money(l.value, ctx.currency)
                : Math.round(l.value),
        changePct: l.delta,
        note: l.value == null ? l.unavailableReason : undefined,
      })),
    };
  },
};

const get_business_insights: ToolDef = {
  name: "get_business_insights",
  description: "Structured observations already detected by Zotomic's engine for the last 7 days (with severity). Do not invent causes beyond these.",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: {} },
  async handler(ctx) {
    const end = new Date();
    const cur = new Date(end.getTime() - 7 * DAY);
    const prev = new Date(end.getTime() - 14 * DAY);
    const [c, p, topRes] = await Promise.all([
      getSummary(ctx.businessId, cur, end),
      getSummary(ctx.businessId, prev, cur),
      ctx.db.rpc("metrics_top_products", { p_business: ctx.businessId, p_start: cur.toISOString(), p_end: end.toISOString(), p_limit: 3 }),
    ]);
    const top = ((topRes.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      name: String(r.name),
      revenue: Number(r.revenue ?? 0),
    }));
    return buildObservations(c, p, top, ctx.currency).map((o) => ({ severity: o.severity, observation: o.text }));
  },
};

const get_business_alerts: ToolDef = {
  name: "get_business_alerts",
  description: "Current alerts: unread notifications, low-stock products, and any high-severity observation.",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: {} },
  async handler(ctx) {
    const [{ data: notifs }, { data: low }] = await Promise.all([
      ctx.db
        .from("notifications")
        .select("type, title, created_at")
        .eq("business_id", ctx.businessId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
      ctx.db
        .from("products")
        .select("name, stock_qty")
        .eq("business_id", ctx.businessId)
        .eq("track_inventory", true)
        .lt("stock_qty", 10)
        .eq("status", "active"),
    ]);
    return {
      unreadNotifications: (notifs ?? []).map((x) => ({ type: x.type, title: x.title })),
      lowStock: (low ?? []).map((x) => ({ product: x.name, stock: x.stock_qty })),
    };
  },
};

const get_latest_report: ToolDef = {
  name: "get_latest_report",
  description: "The most recent Weekly Intelligence report: period, status, AI summary.",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: {} },
  async handler(ctx) {
    const { data } = await ctx.db
      .from("reports")
      .select("id, status, period_start, period_end, summary, model, generated_at")
      .eq("business_id", ctx.businessId)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? { error: "No reports yet" };
  },
};

const get_report_insights: ToolDef = {
  name: "get_report_insights",
  description: "The insights and recommendations behind a specific report (or the latest if no id given).",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: { reportId: { type: "string" } } },
  async handler(ctx, a) {
    let reportId = s(a.reportId);
    if (!reportId) {
      const { data } = await ctx.db
        .from("reports")
        .select("id")
        .eq("business_id", ctx.businessId)
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      reportId = data?.id as string;
    }
    if (!reportId) return { error: "No report found" };
    const [{ data: insights }, { data: recs }, { data: metrics }] = await Promise.all([
      ctx.db.from("insights").select("severity, title, body").eq("report_id", reportId).eq("business_id", ctx.businessId),
      ctx.db.from("recommendations").select("title, detail, effort, impact, status").eq("report_id", reportId).eq("business_id", ctx.businessId),
      ctx.db.from("report_metrics").select("label, value, change_pct, available, unavailable_reason").eq("report_id", reportId),
    ]);
    return { insights: insights ?? [], recommendations: recs ?? [], metrics: metrics ?? [] };
  },
};

const list_tasks: ToolDef = {
  name: "list_tasks",
  description: "The business's tasks (open by default).",
  risk: "read",
  creditCost: 0,
  parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "done"] } } },
  async handler(ctx, a) {
    const { data } = await ctx.db
      .from("tasks")
      .select("id, title, priority, status, source")
      .eq("business_id", ctx.businessId)
      .eq("status", s(a.status) ?? "open")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  },
};

// ── write tools ────────────────────────────────────────────────────────────

const create_task: ToolDef = {
  name: "create_task",
  description: "Create an internal task/reminder for the business.",
  risk: "write",
  creditCost: 1,
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["title"],
  },
  async handler(ctx, a) {
    const title = s(a.title)?.trim();
    if (!title) return { error: "title required" };
    const { data } = await ctx.db
      .from("tasks")
      .insert({
        business_id: ctx.businessId,
        title: title.slice(0, 200),
        priority: ["low", "medium", "high"].includes(s(a.priority) ?? "") ? s(a.priority) : "medium",
        source: "assistant",
        created_by: ctx.userId,
      })
      .select("id, title, priority")
      .single();
    return { created: data };
  },
};

// ── consequential tools ────────────────────────────────────────────────────

const update_product: ToolDef = {
  name: "update_product",
  description: "Modify approved fields of one product: price, sale_price, status, category, stock_qty, buying_price, marketing_cost. Requires user confirmation.",
  risk: "consequential",
  creditCost: 1,
  parameters: {
    type: "object",
    properties: {
      productId: { type: "string" },
      price: { type: "number" },
      sale_price: { type: "number" },
      status: { type: "string", enum: ["active", "draft", "archived"] },
      category: { type: "string" },
      stock_qty: { type: "number" },
      buying_price: { type: "number" },
      marketing_cost: { type: "number" },
    },
    required: ["productId"],
  },
  async handler(ctx, a) {
    const id = s(a.productId);
    if (!id) return { error: "productId required" };
    const { data: before } = await ctx.db
      .from("products")
      .select("id, name, price, sale_price, status, category, stock_qty, buying_price, marketing_cost")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (!before) return { error: "Product not found" };

    const patch: Record<string, unknown> = {};
    for (const k of ["price", "sale_price", "stock_qty", "buying_price", "marketing_cost"] as const) {
      if (n(a[k]) !== undefined) patch[k] = n(a[k]);
    }
    if (s(a.status)) patch.status = s(a.status);
    if (s(a.category) !== undefined) patch.category = s(a.category) || null;
    if (Object.keys(patch).length === 0) return { error: "Nothing to change" };

    await ctx.db.from("products").update(patch).eq("business_id", ctx.businessId).eq("id", id);
    await ctx.db.from("audit_logs").insert({
      business_id: ctx.businessId,
      actor_id: ctx.userId,
      actor_type: "assistant",
      action: "product.updated",
      target_type: "product",
      target_id: id,
      summary: `Assistant updated "${before.name}"`,
      before,
      after: patch,
    });
    return { updated: before.name, changes: patch };
  },
};

const update_business_settings: ToolDef = {
  name: "update_business_settings",
  description: "Modify approved business settings: currency, timezone, description. Requires user confirmation.",
  risk: "consequential",
  creditCost: 1,
  parameters: {
    type: "object",
    properties: {
      currency: { type: "string" },
      timezone: { type: "string" },
      description: { type: "string" },
    },
  },
  async handler(ctx, a) {
    const patch: Record<string, unknown> = {};
    if (s(a.currency)) patch.currency = s(a.currency)!.toUpperCase().slice(0, 3);
    if (s(a.timezone)) patch.timezone = s(a.timezone);
    if (s(a.description) !== undefined) patch.description = s(a.description) || null;
    if (Object.keys(patch).length === 0) return { error: "Nothing to change" };

    const { data: before } = await ctx.db.from("businesses").select("currency, timezone, description").eq("id", ctx.businessId).single();
    await ctx.db.from("businesses").update(patch).eq("id", ctx.businessId);
    await ctx.db.from("audit_logs").insert({
      business_id: ctx.businessId,
      actor_id: ctx.userId,
      actor_type: "assistant",
      action: "business.settings_updated",
      target_type: "business",
      target_id: ctx.businessId,
      summary: "Assistant updated business settings",
      before,
      after: patch,
    });
    return { updated: patch };
  },
};

const send_report_telegram: ToolDef = {
  name: "send_report_telegram",
  description: "Send the latest Weekly Report to the owner's Telegram. Requires a Telegram chat ID set in Settings.",
  risk: "write",
  creditCost: 1,
  parameters: { type: "object", properties: {} },
  async handler(ctx) {
    const res = await deliverReportTelegram(ctx.businessId);
    return { delivered: res.ok, message: res.message };
  },
};

const send_report_email: ToolDef = {
  name: "send_report_email",
  description: "Email the latest Weekly Report (from Zotomic Assistant). Defaults to the owner's email; an address can be given.",
  risk: "write",
  creditCost: 1,
  parameters: {
    type: "object",
    properties: { email: { type: "string", description: "recipient; omit to use the owner's email" } },
  },
  async handler(ctx, a) {
    const res = await deliverReportEmail(ctx.businessId, s(a.email));
    return { delivered: res.ok, message: res.message };
  },
};

export const TOOLS: ToolDef[] = [
  get_business_profile,
  get_business_settings,
  list_products,
  get_product,
  search_orders,
  get_order_summary,
  search_customers,
  get_customer_summary,
  get_business_metrics,
  get_business_insights,
  get_business_alerts,
  get_latest_report,
  get_report_insights,
  list_tasks,
  create_task,
  send_report_telegram,
  send_report_email,
  update_product,
  update_business_settings,
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function toolContext(over: Partial<ToolContext> & Pick<ToolContext, "businessId" | "userId" | "db">): ToolContext {
  return { role: "owner", currency: "BDT", ...over };
}
