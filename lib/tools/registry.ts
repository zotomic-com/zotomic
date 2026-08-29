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

const get_order_details: ToolDef = {
  name: "get_order_details",
  description:
    "Full detail for ONE order: line items (with variant), amounts, status, payment, dates, the customer, the shipping/delivery address, any courier shipment, any linked return, and the cancellation reason if cancelled. Look up by order number (e.g. ZF-AB12CD) or order id.",
  risk: "read",
  creditCost: 0,
  parameters: {
    type: "object",
    properties: {
      orderNumber: { type: "string", description: "the human order number, e.g. ZF-AB12CD" },
      orderId: { type: "string", description: "the internal order id (uuid)" },
    },
  },
  async handler(ctx, a) {
    const num = s(a.orderNumber)?.trim();
    const id = s(a.orderId)?.trim();
    if (!num && !id) return { error: "Provide orderNumber or orderId" };

    let q = ctx.db
      .from("orders")
      .select(
        "id, order_number, status, channel, payment_method, payment_status, subtotal, shipping, discount, total, currency, placed_at, delivered_at, cancelled_at, cancel_reason, address, notes, customers(name, phone, email, city), order_items(name, qty, unit_price, line_total, variant_label)",
      )
      .eq("business_id", ctx.businessId)
      .limit(1);
    q = num ? q.eq("order_number", num) : q.eq("id", id!);
    const { data: o } = await q.maybeSingle();
    if (!o) return { error: "Order not found" };

    const [{ data: shipment }, { data: ret }] = await Promise.all([
      ctx.db
        .from("shipments")
        .select("provider, status, tracking_code, consignment_id, cost, created_at, updated_at")
        .eq("order_id", o.id)
        .maybeSingle(),
      ctx.db
        .from("returns")
        .select("return_number, status, reason, refund_amount, restock, created_at")
        .eq("order_id", o.id)
        .maybeSingle(),
    ]);

    const cust = (Array.isArray(o.customers) ? o.customers[0] : o.customers) as
      | { name?: string; phone?: string; email?: string; city?: string }
      | null;
    const addr = (o.address ?? {}) as { line?: string; city?: string; note?: string };

    return {
      orderNumber: o.order_number,
      status: o.status,
      channel: o.channel,
      placedAt: o.placed_at,
      deliveredAt: o.delivered_at,
      cancelledAt: o.cancelled_at,
      cancelReason: o.status === "cancelled" ? (o.cancel_reason ?? null) : undefined,
      payment: { method: o.payment_method, status: o.payment_status },
      amounts: {
        subtotal: money(Number(o.subtotal), o.currency as string),
        shipping: money(Number(o.shipping), o.currency as string),
        discount: money(Number(o.discount ?? 0), o.currency as string),
        total: money(Number(o.total), o.currency as string),
      },
      customer: cust ? { name: cust.name, phone: cust.phone, email: cust.email, city: cust.city } : null,
      shippingAddress: { line: addr.line ?? null, city: addr.city ?? cust?.city ?? null, note: addr.note ?? null },
      orderNote: o.notes ?? null,
      items: ((o.order_items ?? []) as Record<string, unknown>[]).map((i) => ({
        name: i.name,
        variant: i.variant_label ?? null,
        qty: i.qty,
        unitPrice: money(Number(i.unit_price), o.currency as string),
        lineTotal: money(Number(i.line_total), o.currency as string),
      })),
      shipment: shipment
        ? {
            provider: shipment.provider,
            status: shipment.status,
            trackingCode: shipment.tracking_code ?? null,
            consignmentId: shipment.consignment_id ?? null,
            cost: shipment.cost != null ? money(Number(shipment.cost), o.currency as string) : null,
          }
        : null,
      return: ret
        ? {
            returnNumber: ret.return_number,
            status: ret.status,
            reason: ret.reason ?? null,
            refund: money(Number(ret.refund_amount ?? 0), o.currency as string),
            restock: ret.restock,
          }
        : null,
    };
  },
};

const get_shipping_address: ToolDef = {
  name: "get_shipping_address",
  description:
    "The shipping / delivery address for an order (by order number), or a customer's known addresses (by phone or name) — their most recent order address plus any addresses saved in their storefront account. Use this to fill a courier booking or confirm where to deliver.",
  risk: "read",
  creditCost: 0,
  parameters: {
    type: "object",
    properties: {
      orderNumber: { type: "string" },
      customerPhone: { type: "string" },
      customerName: { type: "string" },
    },
  },
  async handler(ctx, a) {
    const orderNumber = s(a.orderNumber)?.trim();
    if (orderNumber) {
      const { data: o } = await ctx.db
        .from("orders")
        .select("order_number, address, customers(name, phone, city)")
        .eq("business_id", ctx.businessId)
        .eq("order_number", orderNumber)
        .maybeSingle();
      if (!o) return { error: "Order not found" };
      const cust = (Array.isArray(o.customers) ? o.customers[0] : o.customers) as
        | { name?: string; phone?: string; city?: string }
        | null;
      const addr = (o.address ?? {}) as { line?: string; city?: string; note?: string };
      return {
        source: "order",
        orderNumber: o.order_number,
        recipient: cust?.name ?? null,
        phone: cust?.phone ?? null,
        address: addr.line ?? null,
        city: addr.city ?? cust?.city ?? null,
        note: addr.note ?? null,
      };
    }

    const phone = s(a.customerPhone)?.trim();
    const name = s(a.customerName)?.trim();
    if (!phone && !name) return { error: "Provide orderNumber, customerPhone or customerName" };

    let cq = ctx.db.from("customers").select("id, name, phone, city").eq("business_id", ctx.businessId).limit(5);
    cq = phone ? cq.eq("phone", phone) : cq.ilike("name", `%${name}%`);
    const { data: custs } = await cq;
    if (!custs?.length) return { error: "No matching customer" };
    if (custs.length > 1) {
      return { matches: custs.map((c) => ({ name: c.name, phone: c.phone, city: c.city })), note: "Multiple customers matched — ask which one." };
    }
    const c = custs[0];

    const { data: recentOrders } = await ctx.db
      .from("orders")
      .select("order_number, address, placed_at")
      .eq("business_id", ctx.businessId)
      .eq("customer_id", c.id)
      .order("placed_at", { ascending: false })
      .limit(3);

    const { data: accounts } = await ctx.db
      .from("store_accounts")
      .select("id")
      .eq("business_id", ctx.businessId)
      .eq("customer_id", c.id);
    const accountIds = (accounts ?? []).map((x) => x.id as string);
    const { data: saved } = accountIds.length
      ? await ctx.db
          .from("store_account_addresses")
          .select("label, name, phone, address, city, area, is_default")
          .eq("business_id", ctx.businessId)
          .in("account_id", accountIds)
      : { data: [] as Record<string, unknown>[] };

    return {
      source: "customer",
      customer: { name: c.name, phone: c.phone, city: c.city },
      fromOrders: (recentOrders ?? []).map((o) => {
        const ad = (o.address ?? {}) as { line?: string; city?: string; note?: string };
        return { orderNumber: o.order_number, address: ad.line ?? null, city: ad.city ?? null, note: ad.note ?? null, placedAt: o.placed_at };
      }),
      savedAddresses: (saved ?? []).map((x) => ({
        label: x.label,
        name: x.name,
        phone: x.phone,
        address: x.address,
        city: [x.area, x.city].filter(Boolean).join(", "),
        default: x.is_default,
      })),
    };
  },
};

const get_customer_details: ToolDef = {
  name: "get_customer_details",
  description:
    "One customer's profile and, unless includeHistory is false, their order history: lifetime totals, recent orders, and counts of cancelled and returned orders. Look up by phone, name, or customer id. If several customers match a name, a short list is returned so you can ask which one.",
  risk: "read",
  creditCost: 0,
  parameters: {
    type: "object",
    properties: {
      phone: { type: "string" },
      name: { type: "string" },
      customerId: { type: "string" },
      includeHistory: { type: "boolean", description: "default true" },
      historyLimit: { type: "number", description: "recent orders to list, default 10, max 25" },
    },
  },
  async handler(ctx, a) {
    const phone = s(a.phone)?.trim();
    const name = s(a.name)?.trim();
    const cid = s(a.customerId)?.trim();
    if (!phone && !name && !cid) return { error: "Provide phone, name or customerId" };

    let cq = ctx.db
      .from("customers")
      .select("id, name, phone, email, city, notes, total_orders, total_spent, first_order_at, last_order_at")
      .eq("business_id", ctx.businessId)
      .limit(6);
    if (cid) cq = cq.eq("id", cid);
    else if (phone) cq = cq.eq("phone", phone);
    else cq = cq.ilike("name", `%${name}%`);
    const { data: rows } = await cq;
    if (!rows?.length) return { error: "No matching customer" };
    if (rows.length > 1) {
      return {
        matches: rows.map((c) => ({ name: c.name, phone: c.phone, city: c.city, orders: c.total_orders })),
        note: "Multiple customers matched — ask which one, then call again with the exact phone.",
      };
    }
    const c = rows[0];
    const totalOrders = Number(c.total_orders ?? 0);
    const totalSpent = Number(c.total_spent ?? 0);
    const profile = {
      name: c.name,
      phone: c.phone,
      email: c.email,
      city: c.city,
      notes: c.notes ?? null,
      lifetime: {
        orders: totalOrders,
        spent: money(totalSpent, ctx.currency),
        averageOrderValue: money(totalOrders ? totalSpent / totalOrders : 0, ctx.currency),
        firstOrderAt: c.first_order_at,
        lastOrderAt: c.last_order_at,
      },
    };

    if (a.includeHistory === false) return profile;

    const limit = Math.min(n(a.historyLimit) ?? 10, 25);
    const { data: orders } = await ctx.db
      .from("orders")
      .select("order_number, status, total, placed_at, order_items(qty)")
      .eq("business_id", ctx.businessId)
      .eq("customer_id", c.id)
      .order("placed_at", { ascending: false })
      .limit(limit);
    const list = orders ?? [];

    return {
      ...profile,
      history: list.map((o) => ({
        orderNumber: o.order_number,
        date: o.placed_at,
        status: o.status,
        total: money(Number(o.total), ctx.currency),
        items: ((o.order_items ?? []) as { qty: number }[]).reduce((x, i) => x + Number(i.qty), 0),
      })),
      cancelledOrders: list.filter((o) => o.status === "cancelled").length,
      returnedOrders: list.filter((o) => o.status === "returned").length,
    };
  },
};

const get_cancelled_orders: ToolDef = {
  name: "get_cancelled_orders",
  description:
    "Cancelled orders and why. Each row has the recorded cancellation reason, or null when no reason was captured — if the user asks about a cancellation with a null reason, tell them it wasn't recorded and ask them for it. Optionally filter by recency or by customer.",
  risk: "read",
  creditCost: 0,
  parameters: {
    type: "object",
    properties: {
      sinceDays: { type: "number", description: "only orders placed in the last N days" },
      customerPhone: { type: "string" },
      customerName: { type: "string" },
      limit: { type: "number", description: "default 20, max 50" },
    },
  },
  async handler(ctx, a) {
    let customerId: string | undefined;
    const phone = s(a.customerPhone)?.trim();
    const name = s(a.customerName)?.trim();
    if (phone || name) {
      let cq = ctx.db.from("customers").select("id").eq("business_id", ctx.businessId).limit(1);
      cq = phone ? cq.eq("phone", phone) : cq.ilike("name", `%${name}%`);
      const { data } = await cq.maybeSingle();
      if (!data) return { error: "No matching customer" };
      customerId = data.id as string;
    }

    let q = ctx.db
      .from("orders")
      .select("order_number, total, currency, placed_at, cancelled_at, cancel_reason, customers(name, phone)")
      .eq("business_id", ctx.businessId)
      .eq("status", "cancelled")
      .order("cancelled_at", { ascending: false, nullsFirst: false })
      .limit(Math.min(n(a.limit) ?? 20, 50));
    if (customerId) q = q.eq("customer_id", customerId);
    if (n(a.sinceDays)) q = q.gte("placed_at", new Date(Date.now() - n(a.sinceDays)! * DAY).toISOString());
    const { data } = await q;
    const rows = data ?? [];

    const totalValue = rows.reduce((x, o) => x + Number(o.total), 0);
    return {
      count: rows.length,
      totalValueCancelled: money(totalValue, ctx.currency),
      orders: rows.map((o) => {
        const cust = (Array.isArray(o.customers) ? o.customers[0] : o.customers) as { name?: string; phone?: string } | null;
        return {
          orderNumber: o.order_number,
          customer: cust?.name ?? "Guest",
          phone: cust?.phone ?? null,
          total: money(Number(o.total), (o.currency as string) ?? ctx.currency),
          placedAt: o.placed_at,
          cancelledAt: o.cancelled_at,
          reason: o.cancel_reason ?? null,
        };
      }),
    };
  },
};

const get_returns: ToolDef = {
  name: "get_returns",
  description:
    "Return / RMA history with the reason each item was returned, refund amount, restock flag, status, and the returned items. Optionally filter by recency, return status, or customer. If a reason is null it wasn't recorded — ask the user.",
  risk: "read",
  creditCost: 0,
  parameters: {
    type: "object",
    properties: {
      sinceDays: { type: "number" },
      status: {
        type: "string",
        enum: ["requested", "approved", "received", "refunded", "rejected", "cancelled"],
      },
      customerPhone: { type: "string" },
      customerName: { type: "string" },
      limit: { type: "number", description: "default 20, max 50" },
    },
  },
  async handler(ctx, a) {
    let orderIds: string[] | undefined;
    const phone = s(a.customerPhone)?.trim();
    const name = s(a.customerName)?.trim();
    if (phone || name) {
      let cq = ctx.db.from("customers").select("id").eq("business_id", ctx.businessId).limit(1);
      cq = phone ? cq.eq("phone", phone) : cq.ilike("name", `%${name}%`);
      const { data: c } = await cq.maybeSingle();
      if (!c) return { error: "No matching customer" };
      const { data: os } = await ctx.db
        .from("orders")
        .select("id")
        .eq("business_id", ctx.businessId)
        .eq("customer_id", c.id);
      orderIds = (os ?? []).map((o) => o.id as string);
      if (!orderIds.length) return { count: 0, returns: [] };
    }

    let q = ctx.db
      .from("returns")
      .select(
        "return_number, status, reason, refund_amount, refund_method, restock, created_at, processed_at, orders(order_number, customers(name, phone)), return_items(name, qty, unit_price)",
      )
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: false })
      .limit(Math.min(n(a.limit) ?? 20, 50));
    if (s(a.status)) q = q.eq("status", s(a.status)!);
    if (orderIds) q = q.in("order_id", orderIds);
    if (n(a.sinceDays)) q = q.gte("created_at", new Date(Date.now() - n(a.sinceDays)! * DAY).toISOString());
    const { data } = await q;
    const rows = data ?? [];

    const totalRefunded = rows
      .filter((r) => r.status === "refunded")
      .reduce((x, r) => x + Number(r.refund_amount ?? 0), 0);

    return {
      count: rows.length,
      totalRefunded: money(totalRefunded, ctx.currency),
      returns: rows.map((r) => {
        const ord = (Array.isArray(r.orders) ? r.orders[0] : r.orders) as
          | { order_number?: string; customers?: unknown }
          | null;
        const cust = (Array.isArray(ord?.customers) ? ord?.customers[0] : ord?.customers) as
          | { name?: string; phone?: string }
          | null;
        return {
          returnNumber: r.return_number,
          orderNumber: ord?.order_number ?? null,
          customer: cust?.name ?? "Guest",
          phone: cust?.phone ?? null,
          status: r.status,
          reason: r.reason ?? null,
          refund: money(Number(r.refund_amount ?? 0), ctx.currency),
          refundMethod: r.refund_method ?? null,
          restock: r.restock,
          createdAt: r.created_at,
          processedAt: r.processed_at,
          items: ((r.return_items ?? []) as { name: string; qty: number }[]).map((i) => ({ name: i.name, qty: i.qty })),
        };
      }),
    };
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
  get_order_details,
  get_shipping_address,
  get_customer_details,
  get_cancelled_orders,
  get_returns,
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
