/**
 * Tool layer for the Admin Assistant.
 *
 * The agent gets NO database handle — every read and every write in here calls
 * `getAdminSupabase()` locally. Consequential tools (`risk: "consequential"`)
 * are surfaced to the admin for a yes/no before they run.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { SF_CHAT_QUOTA, utcPeriod } from "@/lib/storefront/assistant";
import { normalizeSignals } from "@/lib/storefront/assistant-signals";
import { PLANS, type PlanId } from "@/lib/plans";

export type AdminRisk = "read" | "consequential";

export interface AdminToolDef {
  name: string;
  description: string;
  risk: AdminRisk;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  handler: (adminId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nz = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Resolve a store by id or (case-insensitive) name. */
async function resolveStore(
  ref: string,
): Promise<{ id: string; name: string; currency: string; status: string } | { error: string }> {
  const db = getAdminSupabase();
  const r = ref.trim();
  if (!r) return { error: "Give a store name or id." };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r);
  const q = db.from("businesses").select("id, name, currency, status");
  const { data } = uuid ? await q.eq("id", r).limit(2) : await q.ilike("name", `%${r}%`).limit(5);
  if (!data?.length) return { error: `No store matches "${ref}".` };
  if (data.length > 1)
    return { error: `Several stores match "${ref}": ${data.map((b) => b.name).join(", ")}. Be more specific.` };
  return {
    id: data[0].id as string,
    name: data[0].name as string,
    currency: (data[0].currency as string) ?? "BDT",
    status: data[0].status as string,
  };
}

async function writeAudit(businessId: string, adminId: string, action: string, summary: string) {
  const db = getAdminSupabase();
  await db.from("audit_logs").insert({
    business_id: businessId,
    actor_id: adminId,
    actor_type: "admin",
    action,
    target_type: "business",
    target_id: businessId,
    summary: `Admin assistant: ${summary}`,
  });
}

async function writeUserAudit(adminId: string, action: string, summary: string, userId?: string) {
  await getAdminSupabase().from("audit_logs").insert({
    actor_id: adminId,
    actor_type: "admin",
    action,
    target_type: "user",
    target_id: userId ?? null,
    summary: `Admin assistant: ${summary}`,
  });
}

async function resolveUser(
  ref: string,
): Promise<{ id: string; name: string; email: string; role: string; status: string; blocked: boolean; last_ip: string | null } | { error: string }> {
  const db = getAdminSupabase();
  const r = ref.trim();
  if (!r) return { error: "Give a user email or id." };
  const uuid = /^[0-9a-f-]{36}$/i.test(r);
  const q = db.from("users").select("id, name, email, role, status, blocked, last_ip");
  const { data } = uuid ? await q.eq("id", r).limit(2) : await q.ilike("email", `%${r}%`).limit(5);
  if (!data?.length) return { error: `No user matches "${ref}".` };
  if (data.length > 1) return { error: `Several users match: ${data.map((u) => u.email).join(", ")}. Be specific.` };
  const u = data[0];
  return {
    id: u.id as string,
    name: u.name as string,
    email: u.email as string,
    role: u.role as string,
    status: u.status as string,
    blocked: !!u.blocked,
    last_ip: (u.last_ip as string) ?? null,
  };
}

/* ─────────────────────────────  read tools  ───────────────────────────── */

const platform_overview: AdminToolDef = {
  name: "platform_overview",
  description:
    "Platform-wide snapshot: number of stores by plan and status, active subscriptions, new signups and order/revenue totals for the last 7 and 30 days.",
  risk: "read",
  parameters: { type: "object", properties: {} },
  async handler() {
    const db = getAdminSupabase();
    const d7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: biz }, { data: subs }, { data: o7 }, { data: o30 }] = await Promise.all([
      db.from("businesses").select("id, status, created_at"),
      db.from("subscriptions").select("plan, status"),
      db.from("orders").select("total, status, placed_at").gte("placed_at", d7),
      db.from("orders").select("total, status, placed_at").gte("placed_at", d30),
    ]);
    const rev = (rows: { total: unknown; status: unknown }[]) =>
      rows.filter((o) => o.status !== "cancelled").reduce((n, o) => n + Number(o.total), 0);
    const planCount: Record<string, number> = {};
    for (const s2 of subs ?? []) planCount[s2.plan as string] = (planCount[s2.plan as string] ?? 0) + 1;
    return {
      stores: (biz ?? []).length,
      storesActive: (biz ?? []).filter((b) => b.status === "active").length,
      storesSuspended: (biz ?? []).filter((b) => b.status !== "active").length,
      newSignups7d: (biz ?? []).filter((b) => (b.created_at as string) >= d7).length,
      byPlan: planCount,
      activeSubscriptions: (subs ?? []).filter((s2) => s2.status === "active").length,
      last7d: { orders: (o7 ?? []).length, revenueBDT: Math.round(rev(o7 ?? [])) },
      last30d: { orders: (o30 ?? []).length, revenueBDT: Math.round(rev(o30 ?? [])) },
    };
  },
};

const list_stores: AdminToolDef = {
  name: "list_stores",
  description:
    "Find stores. Filter by name text, plan (free/business/pro) or status (active/suspended). Returns owner email, plan, status, lifetime revenue and whether the storefront assistant is on.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      plan: { type: "string", enum: ["free", "business", "pro"] },
      status: { type: "string", enum: ["active", "suspended"] },
      limit: { type: "number" },
    },
  },
  async handler(_a, args) {
    const db = getAdminSupabase();
    let q = db.from("businesses").select("id, name, status, currency, created_at").order("created_at", { ascending: false });
    if (s(args.query)) q = q.ilike("name", `%${s(args.query)}%`);
    if (s(args.status)) q = q.eq("status", s(args.status));
    const { data: biz } = await q.limit(Math.min(nz(args.limit) ?? 20, 50));
    const ids = (biz ?? []).map((b) => b.id as string);
    if (!ids.length) return { stores: [] };
    const [{ data: subs }, { data: members }, { data: orders }, { data: sfa }] = await Promise.all([
      db.from("subscriptions").select("business_id, plan, status").in("business_id", ids),
      db.from("business_members").select("business_id, users(email)").eq("role", "owner").in("business_id", ids),
      db.from("orders").select("business_id, total, status").in("business_id", ids).neq("status", "cancelled"),
      db.from("storefront_assistant_config").select("business_id, enabled, suspended").in("business_id", ids),
    ]);
    const rev = new Map<string, number>();
    for (const o of orders ?? []) rev.set(o.business_id as string, (rev.get(o.business_id as string) ?? 0) + Number(o.total));
    let rows = (biz ?? []).map((b) => {
      const sub = (subs ?? []).find((x) => x.business_id === b.id);
      const mem = (members ?? []).find((x) => x.business_id === b.id);
      const a = (sfa ?? []).find((x) => x.business_id === b.id);
      return {
        id: b.id as string,
        name: b.name as string,
        owner: ((Array.isArray(mem?.users) ? mem?.users[0] : mem?.users) as { email?: string } | null)?.email ?? "—",
        plan: (sub?.plan as string) ?? "free",
        status: b.status as string,
        revenue: money(rev.get(b.id as string) ?? 0, (b.currency as string) ?? "BDT"),
        storefrontAssistant: a?.suspended ? "suspended" : a?.enabled ? "on" : "off",
      };
    });
    if (s(args.plan)) rows = rows.filter((r) => r.plan === s(args.plan));
    return { stores: rows };
  },
};

const store_detail: AdminToolDef = {
  name: "store_detail",
  description:
    "Everything about ONE store (by name or id): owner, plan, status, order/revenue/product counts, assistant credit balance, the storefront assistant's state + this-month usage, and whether the owner's Zotomic Assistant is suspended.",
  risk: "read",
  parameters: { type: "object", properties: { store: { type: "string" } }, required: ["store"] },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const [{ data: b }, { data: sub }, { data: mem }, { count: products }, { data: orders }, { data: acc }, { data: sfa }, { data: usage }] =
      await Promise.all([
        db.from("businesses").select("assistant_suspended, assistant_suspended_reason, created_at").eq("id", st.id).single(),
        db.from("subscriptions").select("plan, status, current_period_end").eq("business_id", st.id).maybeSingle(),
        db.from("business_members").select("users(name, email)").eq("business_id", st.id).eq("role", "owner").maybeSingle(),
        db.from("products").select("id", { count: "exact", head: true }).eq("business_id", st.id),
        db.from("orders").select("total, status").eq("business_id", st.id),
        db.from("credit_accounts").select("allowance_balance, purchased_balance").eq("business_id", st.id).maybeSingle(),
        db.from("storefront_assistant_config").select("enabled, suspended, suspended_reason, extra_conversations, persona").eq("business_id", st.id).maybeSingle(),
        db.from("storefront_assistant_usage").select("conversations, messages, blocked").eq("business_id", st.id).eq("period", utcPeriod()).maybeSingle(),
      ]);
    const owner = (Array.isArray(mem?.users) ? mem?.users[0] : mem?.users) as { name?: string; email?: string } | null;
    const plan = (sub?.plan as PlanId) ?? "free";
    const rev = (orders ?? []).filter((o) => o.status !== "cancelled").reduce((n, o) => n + Number(o.total), 0);
    return {
      id: st.id,
      name: st.name,
      owner: owner ? { name: owner.name, email: owner.email } : null,
      plan,
      subscriptionStatus: (sub?.status as string) ?? "active",
      storeStatus: st.status,
      joined: b?.created_at,
      products: products ?? 0,
      orders: (orders ?? []).length,
      revenue: money(rev, st.currency),
      assistantCredits: acc ? Number(acc.allowance_balance) + Number(acc.purchased_balance) : 0,
      ownerAssistant: b?.assistant_suspended ? { suspended: true, reason: b.assistant_suspended_reason } : { suspended: false },
      storefrontAssistant: {
        state: sfa?.suspended ? "suspended" : sfa?.enabled ? "on" : "off",
        suspendedReason: sfa?.suspended_reason ?? null,
        trained: !!sfa?.persona,
        topUpPool: Number(sfa?.extra_conversations ?? 0),
        thisMonth: {
          conversations: Number(usage?.conversations ?? 0),
          quota: SF_CHAT_QUOTA[plan],
          messages: Number(usage?.messages ?? 0),
          turnedAway: Number(usage?.blocked ?? 0),
        },
      },
    };
  },
};

const assistant_usage: AdminToolDef = {
  name: "assistant_usage",
  description:
    "Usage rollup. scope 'owner' = the store-owner Zotomic Assistant (AI turns, tool calls and credits by tool and by store, last 30 days). scope 'storefront' = storefront chatbot conversations/messages/turned-away by store this month.",
  risk: "read",
  parameters: {
    type: "object",
    properties: { scope: { type: "string", enum: ["owner", "storefront"] } },
    required: ["scope"],
  },
  async handler(_a, args) {
    const db = getAdminSupabase();
    if (s(args.scope) === "storefront") {
      const [{ data: rows }, { data: biz }] = await Promise.all([
        db.from("storefront_assistant_usage").select("business_id, conversations, messages, blocked").eq("period", utcPeriod()),
        db.from("businesses").select("id, name"),
      ]);
      const name = new Map((biz ?? []).map((b) => [b.id, b.name]));
      return {
        period: utcPeriod(),
        stores: (rows ?? [])
          .map((r) => ({
            store: name.get(r.business_id) ?? "—",
            conversations: Number(r.conversations),
            messages: Number(r.messages),
            turnedAway: Number(r.blocked),
          }))
          .sort((x, y) => y.conversations - x.conversations),
      };
    }
    const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: usage }, { data: biz }] = await Promise.all([
      db.from("usage_ledger").select("business_id, tool_name, units, cost, kind").gte("created_at", d30),
      db.from("businesses").select("id, name"),
    ]);
    const name = new Map((biz ?? []).map((b) => [b.id, b.name]));
    const byTool = new Map<string, { calls: number; credits: number }>();
    const byStore = new Map<string, { aiTurns: number; calls: number; credits: number }>();
    for (const u of usage ?? []) {
      const tool = (u.tool_name as string) || (u.kind === "ai_tokens" ? "(AI turns)" : "(other)");
      const t = byTool.get(tool) ?? { calls: 0, credits: 0 };
      t.calls += Number(u.units);
      t.credits += Number(u.cost);
      byTool.set(tool, t);
      const b = byStore.get(u.business_id as string) ?? { aiTurns: 0, calls: 0, credits: 0 };
      if (u.kind === "ai_tokens") b.aiTurns += Number(u.units);
      else b.calls += Number(u.units);
      b.credits += Number(u.cost);
      byStore.set(u.business_id as string, b);
    }
    return {
      windowDays: 30,
      byTool: [...byTool.entries()].map(([t, v]) => ({ tool: t, calls: v.calls, credits: Math.round(v.credits) })).sort((a, b) => b.credits - a.credits),
      byStore: [...byStore.entries()]
        .map(([id, v]) => ({ store: name.get(id) ?? "—", aiTurns: v.aiTurns, toolCalls: v.calls, credits: Math.round(v.credits) }))
        .sort((a, b) => b.credits - a.credits)
        .slice(0, 20),
    };
  },
};

const pending_payments: AdminToolDef = {
  name: "pending_payments",
  description: "Submitted bKash/Nagad payments awaiting an admin decision — both assistant-credit packs and storefront-chat top-ups.",
  risk: "read",
  parameters: { type: "object", properties: {} },
  async handler() {
    const db = getAdminSupabase();
    const [{ data: credits }, { data: sfChat }, { data: biz }] = await Promise.all([
      db.from("credit_purchases").select("id, business_id, credits, amount, method, txn_id, submitted_at").eq("status", "submitted"),
      db.from("storefront_chat_purchases").select("id, business_id, conversations, amount, method, txn_id, submitted_at").eq("status", "submitted"),
      db.from("businesses").select("id, name"),
    ]);
    const name = new Map((biz ?? []).map((b) => [b.id, b.name]));
    return {
      creditPacks: (credits ?? []).map((c) => ({
        purchaseId: c.id,
        store: name.get(c.business_id) ?? "—",
        credits: Number(c.credits),
        amountBDT: Number(c.amount),
        method: c.method,
        txnId: c.txn_id,
        at: c.submitted_at,
      })),
      storefrontChatTopups: (sfChat ?? []).map((c) => ({
        purchaseId: c.id,
        store: name.get(c.business_id) ?? "—",
        conversations: Number(c.conversations),
        amountBDT: Number(c.amount),
        method: c.method,
        txnId: c.txn_id,
        at: c.submitted_at,
      })),
    };
  },
};

const flagged_activity: AdminToolDef = {
  name: "flagged_activity",
  description:
    "Things that may need attention: suspended stores, subscriptions in soft/hard lock, stores in credit overdraft, storefront assistants that are turning shoppers away (hit their monthly cap), and recently failed weekly reports.",
  risk: "read",
  parameters: { type: "object", properties: {} },
  async handler() {
    const db = getAdminSupabase();
    const [{ data: biz }, { data: subs }, { data: acc }, { data: usage }, { data: reports }] = await Promise.all([
      db.from("businesses").select("id, name, status"),
      db.from("subscriptions").select("business_id, status"),
      db.from("credit_accounts").select("business_id, allowance_balance, purchased_balance"),
      db.from("storefront_assistant_usage").select("business_id, blocked").eq("period", utcPeriod()).gt("blocked", 0),
      db.from("reports").select("business_id, period_end, error").eq("status", "failed").order("period_end", { ascending: false }).limit(10),
    ]);
    const name = new Map((biz ?? []).map((b) => [b.id, b.name]));
    return {
      suspendedStores: (biz ?? []).filter((b) => b.status !== "active").map((b) => b.name),
      lockedSubscriptions: (subs ?? [])
        .filter((x) => x.status === "soft_lock" || x.status === "hard_lock")
        .map((x) => ({ store: name.get(x.business_id) ?? "—", status: x.status })),
      creditOverdraft: (acc ?? [])
        .filter((x) => Number(x.allowance_balance) + Number(x.purchased_balance) < 0)
        .map((x) => ({ store: name.get(x.business_id) ?? "—", balance: Number(x.allowance_balance) + Number(x.purchased_balance) })),
      storefrontAssistantsAtCap: (usage ?? []).map((x) => ({ store: name.get(x.business_id) ?? "—", turnedAway: Number(x.blocked) })),
      failedReports: (reports ?? []).map((r) => ({ store: name.get(r.business_id) ?? "—", periodEnd: r.period_end, error: r.error })),
    };
  },
};

const get_store_assistant_config: AdminToolDef = {
  name: "get_store_assistant_config",
  description:
    "The full storefront-assistant setup for one store (by name or id): name, greeting, suggested prompts, owner instructions, knowledge Q&A (with ids), promoted products and which live signals are enabled.",
  risk: "read",
  parameters: { type: "object", properties: { store: { type: "string" } }, required: ["store"] },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const [{ data: cfg }, { data: kn }, { data: promo }] = await Promise.all([
      db.from("storefront_assistant_config").select("*").eq("business_id", st.id).maybeSingle(),
      db.from("storefront_assistant_knowledge").select("id, question, answer, enabled").eq("business_id", st.id),
      db.from("storefront_assistant_config").select("promoted_product_ids").eq("business_id", st.id).maybeSingle(),
    ]);
    let promotedNames: string[] = [];
    const pids = Array.isArray(promo?.promoted_product_ids) ? (promo?.promoted_product_ids as string[]) : [];
    if (pids.length) {
      const { data: prods } = await db.from("products").select("name").eq("business_id", st.id).in("id", pids);
      promotedNames = (prods ?? []).map((p) => p.name as string);
    }
    return {
      store: st.name,
      enabled: !!cfg?.enabled,
      suspended: !!cfg?.suspended,
      name: cfg?.name ?? null,
      greeting: cfg?.greeting ?? null,
      suggestedPrompts: cfg?.suggested_prompts ?? [],
      instructions: cfg?.persona ?? null,
      signals: normalizeSignals(cfg?.signals),
      promotedProducts: promotedNames,
      knowledge: (kn ?? []).map((k) => ({ id: k.id, question: k.question, answer: k.answer, enabled: k.enabled })),
    };
  },
};

/* ───────────────  per-store operational data (read-only)  ─────────────── */

const DAY = 86_400_000;

async function soldByProduct(businessId: string, ids: string[], sinceIso: string) {
  const db = getAdminSupabase();
  const map = new Map<string, { units: number; revenue: number }>();
  if (!ids.length) return map;
  const { data } = await db
    .from("order_items")
    .select("product_id, qty, line_total, orders!inner(placed_at, status, business_id)")
    .eq("business_id", businessId)
    .in("product_id", ids)
    .gte("orders.placed_at", sinceIso);
  for (const it of data ?? []) {
    const o = (Array.isArray(it.orders) ? it.orders[0] : it.orders) as { status?: string } | null;
    if (o?.status === "cancelled") continue;
    const cur = map.get(it.product_id as string) ?? { units: 0, revenue: 0 };
    cur.units += Number(it.qty);
    cur.revenue += Number(it.line_total);
    map.set(it.product_id as string, cur);
  }
  return map;
}

const store_products: AdminToolDef = {
  name: "store_products",
  description:
    "List a store's products (by store name or id). Optional: query text, status (active/draft/archived), lowStock. Returns price, cost, margin %, stock and units sold in the last 30 days.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      store: { type: "string" },
      query: { type: "string" },
      status: { type: "string", enum: ["active", "draft", "archived"] },
      lowStock: { type: "boolean" },
      limit: { type: "number" },
    },
    required: ["store"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    let q = db
      .from("products")
      .select("id, name, sku, status, category, price, sale_price, buying_price, stock_qty, track_inventory, has_variants")
      .eq("business_id", st.id)
      .order("created_at", { ascending: false });
    if (s(args.status)) q = q.eq("status", s(args.status));
    if (s(args.query)) q = q.or(`name.ilike.%${s(args.query)}%,sku.ilike.%${s(args.query)}%,category.ilike.%${s(args.query)}%`);
    const { data } = await q.limit(Math.min(nz(args.limit) ?? 40, 100));
    let rows = data ?? [];
    if (args.lowStock === true) rows = rows.filter((p) => p.track_inventory && Number(p.stock_qty) < 10);
    const sold = await soldByProduct(st.id, rows.map((p) => p.id as string), new Date(Date.now() - 30 * DAY).toISOString());
    return {
      store: st.name,
      products: rows.map((p) => {
        const eff = p.sale_price != null && p.sale_price < p.price ? Number(p.sale_price) : Number(p.price);
        const cost = p.buying_price != null ? Number(p.buying_price) : null;
        return {
          id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          status: p.status,
          category: p.category ?? null,
          price: money(Number(p.price), st.currency),
          salePrice: p.sale_price != null ? money(Number(p.sale_price), st.currency) : null,
          cost: cost != null ? money(cost, st.currency) : null,
          marginPct: cost != null && eff > 0 ? Math.round(((eff - cost) / eff) * 100) : null,
          stock: p.track_inventory ? Number(p.stock_qty) : "not tracked",
          hasVariants: !!p.has_variants,
          sold30d: sold.get(p.id as string)?.units ?? 0,
        };
      }),
    };
  },
};

const store_product_detail: AdminToolDef = {
  name: "store_product_detail",
  description: "Full detail for ONE product in a store: description, pricing + cost + margin, stock, variants, 30-day sales, and its review summary.",
  risk: "read",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, product: { type: "string", description: "product name or id" } },
    required: ["store", "product"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const ref = s(args.product);
    const uuid = /^[0-9a-f-]{36}$/i.test(ref);
    const pq = db
      .from("products")
      .select("id, name, sku, slug, description, status, category, price, sale_price, buying_price, marketing_cost, stock_qty, track_inventory, has_variants, is_hot")
      .eq("business_id", st.id);
    const { data: matches } = uuid ? await pq.eq("id", ref).limit(2) : await pq.ilike("name", `%${ref}%`).limit(5);
    if (!matches?.length) return { error: `No product matches "${ref}".` };
    if (matches.length > 1) return { error: `Several match: ${matches.map((m) => m.name).join(", ")}.` };
    const p = matches[0];
    const [{ data: variants }, sold, { data: reviews }] = await Promise.all([
      db.from("product_variants").select("name, sku, options, price, sale_price, buying_price, stock_qty, active").eq("product_id", p.id).order("position"),
      soldByProduct(st.id, [p.id as string], new Date(Date.now() - 30 * DAY).toISOString()),
      db.from("product_reviews").select("rating, status").eq("business_id", st.id).eq("product_id", p.id),
    ]);
    const approved = (reviews ?? []).filter((r) => r.status === "approved");
    const eff = p.sale_price != null && p.sale_price < p.price ? Number(p.sale_price) : Number(p.price);
    const cost = p.buying_price != null ? Number(p.buying_price) : null;
    const s30 = sold.get(p.id as string) ?? { units: 0, revenue: 0 };
    return {
      store: st.name,
      name: p.name,
      sku: p.sku ?? null,
      handle: p.slug,
      status: p.status,
      category: p.category ?? null,
      description: p.description ?? null,
      price: money(Number(p.price), st.currency),
      salePrice: p.sale_price != null ? money(Number(p.sale_price), st.currency) : null,
      cost: cost != null ? money(cost, st.currency) : null,
      marketingCost: p.marketing_cost != null ? money(Number(p.marketing_cost), st.currency) : null,
      marginPct: cost != null && eff > 0 ? Math.round(((eff - cost) / eff) * 100) : null,
      stock: p.track_inventory ? Number(p.stock_qty) : "not tracked",
      isHot: !!p.is_hot,
      variants: (variants ?? []).map((v) => ({
        label: v.name,
        sku: v.sku ?? null,
        options: v.options ?? {},
        price: v.price != null ? money(Number(v.price), st.currency) : null,
        stock: Number(v.stock_qty),
        active: !!v.active,
      })),
      last30Days: { unitsSold: s30.units, revenue: money(s30.revenue, st.currency) },
      reviews: { approved: approved.length, pending: (reviews ?? []).length - approved.length, average: approved.length ? Number((approved.reduce((n, r) => n + Number(r.rating), 0) / approved.length).toFixed(1)) : null },
    };
  },
};

const store_categories: AdminToolDef = {
  name: "store_categories",
  description: "A store's product categories with how many active products are in each.",
  risk: "read",
  parameters: { type: "object", properties: { store: { type: "string" } }, required: ["store"] },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const [{ data: cats }, { data: prods }] = await Promise.all([
      db.from("product_categories").select("name, slug").eq("business_id", st.id).order("sort"),
      db.from("products").select("category").eq("business_id", st.id).eq("status", "active"),
    ]);
    const count = new Map<string, number>();
    for (const p of prods ?? []) if (p.category) count.set(p.category as string, (count.get(p.category as string) ?? 0) + 1);
    const named = (cats ?? []).map((c) => ({ name: c.name as string, products: count.get(c.name as string) ?? 0 }));
    // include free-text categories not in the table
    for (const [name, n] of count) if (!named.some((x) => x.name === name)) named.push({ name, products: n });
    return { store: st.name, categories: named };
  },
};

const store_inventory: AdminToolDef = {
  name: "store_inventory",
  description:
    "A store's inventory position: total units on hand, inventory value at cost, and the low-stock (<10) and out-of-stock lists. Optional filter: low | out.",
  risk: "read",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, filter: { type: "string", enum: ["low", "out"] } },
    required: ["store"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const { data } = await db
      .from("products")
      .select("name, sku, stock_qty, track_inventory, buying_price, status")
      .eq("business_id", st.id)
      .neq("status", "archived");
    const tracked = (data ?? []).filter((p) => p.track_inventory);
    const units = tracked.reduce((n, p) => n + Number(p.stock_qty), 0);
    const value = tracked.reduce((n, p) => n + Number(p.stock_qty) * Number(p.buying_price ?? 0), 0);
    const low = tracked.filter((p) => Number(p.stock_qty) > 0 && Number(p.stock_qty) < 10).map((p) => ({ name: p.name, sku: p.sku ?? null, stock: Number(p.stock_qty) }));
    const out = tracked.filter((p) => Number(p.stock_qty) <= 0).map((p) => ({ name: p.name, sku: p.sku ?? null }));
    const base = { store: st.name, unitsOnHand: units, inventoryValue: money(value, st.currency), untracked: (data ?? []).length - tracked.length };
    if (s(args.filter) === "low") return { ...base, lowStock: low };
    if (s(args.filter) === "out") return { ...base, outOfStock: out };
    return { ...base, lowStockCount: low.length, outOfStockCount: out.length, lowStock: low.slice(0, 20), outOfStock: out.slice(0, 20) };
  },
};

const store_orders: AdminToolDef = {
  name: "store_orders",
  description:
    "A store's recent orders (by store name or id). Optional: status, payment (paid/unpaid/cod), query (order number or customer), limit. Newest first.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      store: { type: "string" },
      status: { type: "string" },
      payment: { type: "string", enum: ["paid", "unpaid", "cod"] },
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["store"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    let q = db
      .from("orders")
      .select("id, order_number, status, payment_method, payment_status, total, placed_at, customers(name, phone), order_items(qty)")
      .eq("business_id", st.id)
      .order("placed_at", { ascending: false });
    if (s(args.status)) q = q.eq("status", s(args.status));
    if (s(args.payment) === "paid") q = q.eq("payment_status", "paid");
    else if (s(args.payment) === "unpaid") q = q.eq("payment_status", "unpaid");
    else if (s(args.payment) === "cod") q = q.eq("payment_method", "cod");
    if (s(args.query)) q = q.ilike("order_number", `%${s(args.query)}%`);
    const { data } = await q.limit(Math.min(nz(args.limit) ?? 25, 100));
    return {
      store: st.name,
      orders: (data ?? []).map((o) => {
        const c = (Array.isArray(o.customers) ? o.customers[0] : o.customers) as { name?: string; phone?: string } | null;
        return {
          number: o.order_number,
          customer: c?.name ?? "Guest",
          phone: c?.phone ?? null,
          items: (o.order_items ?? []).reduce((n: number, i: { qty: number }) => n + Number(i.qty), 0),
          total: money(Number(o.total), st.currency),
          status: o.status,
          payment: o.payment_status,
          placed: o.placed_at,
        };
      }),
    };
  },
};

const store_order_detail: AdminToolDef = {
  name: "store_order_detail",
  description: "Full detail for ONE order in a store (by order number): line items, amounts, the customer, delivery address, payment, status, any courier shipment and any linked return.",
  risk: "read",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, order: { type: "string", description: "order number, e.g. ZF-AB12CD" } },
    required: ["store", "order"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const { data: o } = await db
      .from("orders")
      .select("id, order_number, status, payment_method, payment_status, subtotal, shipping, discount, total, currency, address, notes, placed_at, delivered_at, cancelled_at, cancel_reason, customers(name, phone, email, city, total_orders, total_spent)")
      .eq("business_id", st.id)
      .ilike("order_number", s(args.order))
      .maybeSingle();
    if (!o) return { error: `No order "${s(args.order)}" in ${st.name}.` };
    const [{ data: items }, { data: ship }, { data: ret }] = await Promise.all([
      db.from("order_items").select("name, variant_label, qty, unit_price, line_total").eq("order_id", o.id),
      db.from("shipments").select("provider, status, tracking_code, consignment_id, cost").eq("order_id", o.id).maybeSingle(),
      db.from("returns").select("return_number, status, refund_amount").eq("order_id", o.id),
    ]);
    const c = (Array.isArray(o.customers) ? o.customers[0] : o.customers) as Record<string, unknown> | null;
    const cur = (o.currency as string) || st.currency;
    return {
      store: st.name,
      number: o.order_number,
      status: o.status,
      payment: { method: o.payment_method, status: o.payment_status },
      placed: o.placed_at,
      deliveredAt: o.delivered_at ?? null,
      cancelledAt: o.cancelled_at ?? null,
      cancelReason: o.cancel_reason ?? null,
      customer: c ? { name: c.name, phone: c.phone, email: c.email, city: c.city, lifetimeOrders: c.total_orders, lifetimeSpent: money(Number(c.total_spent ?? 0), st.currency) } : null,
      address: o.address ?? null,
      items: (items ?? []).map((i) => ({
        name: i.variant_label ? `${i.name} (${i.variant_label})` : i.name,
        qty: Number(i.qty),
        unitPrice: money(Number(i.unit_price), cur),
        lineTotal: money(Number(i.line_total), cur),
      })),
      totals: {
        subtotal: money(Number(o.subtotal), cur),
        shipping: money(Number(o.shipping), cur),
        discount: money(Number(o.discount ?? 0), cur),
        total: money(Number(o.total), cur),
      },
      shipment: ship ? { provider: ship.provider, status: ship.status, tracking: ship.tracking_code ?? null, consignment: ship.consignment_id ?? null, cost: ship.cost != null ? money(Number(ship.cost), cur) : null } : null,
      returns: (ret ?? []).map((r) => ({ number: r.return_number, status: r.status, refund: money(Number(r.refund_amount), cur) })),
      notes: o.notes ?? null,
    };
  },
};

const store_returns: AdminToolDef = {
  name: "store_returns",
  description: "A store's returns/refunds. Optional: status (requested/approved/received/refunded/rejected), limit.",
  risk: "read",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, status: { type: "string" }, limit: { type: "number" } },
    required: ["store"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    let q = db
      .from("returns")
      .select("return_number, status, reason, refund_amount, refund_method, restock, created_at, processed_at, orders(order_number, customers(name))")
      .eq("business_id", st.id)
      .order("created_at", { ascending: false });
    if (s(args.status)) q = q.eq("status", s(args.status));
    const { data } = await q.limit(Math.min(nz(args.limit) ?? 25, 100));
    return {
      store: st.name,
      returns: (data ?? []).map((r) => {
        const o = (Array.isArray(r.orders) ? r.orders[0] : r.orders) as { order_number?: string; customers?: unknown } | null;
        const c = o ? ((Array.isArray(o.customers) ? o.customers[0] : o.customers) as { name?: string } | null) : null;
        return {
          number: r.return_number,
          order: o?.order_number ?? null,
          customer: c?.name ?? "—",
          status: r.status,
          reason: r.reason ?? null,
          refund: money(Number(r.refund_amount), st.currency),
          method: r.refund_method ?? null,
          restock: !!r.restock,
          requested: r.created_at,
          processed: r.processed_at ?? null,
        };
      }),
    };
  },
};

const store_customers: AdminToolDef = {
  name: "store_customers",
  description:
    "A store's customers. Optional: query (name/phone/email), segment (repeat = >1 order, inactive = no order in 90 days), limit. Sorted by lifetime spend.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      store: { type: "string" },
      query: { type: "string" },
      segment: { type: "string", enum: ["repeat", "inactive"] },
      limit: { type: "number" },
    },
    required: ["store"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    let q = db
      .from("customers")
      .select("name, phone, email, city, total_orders, total_spent, first_order_at, last_order_at")
      .eq("business_id", st.id)
      .order("total_spent", { ascending: false });
    if (s(args.query)) q = q.or(`name.ilike.%${s(args.query)}%,phone.ilike.%${s(args.query)}%,email.ilike.%${s(args.query)}%`);
    const { data } = await q.limit(Math.min(nz(args.limit) ?? 30, 100));
    const cutoff = Date.now() - 90 * DAY;
    let rows = (data ?? []).map((c) => ({
      name: c.name ?? "Guest",
      phone: c.phone ?? null,
      email: c.email ?? null,
      city: c.city ?? null,
      orders: Number(c.total_orders ?? 0),
      spent: money(Number(c.total_spent ?? 0), st.currency),
      lastOrder: c.last_order_at ?? null,
      _last: c.last_order_at ? new Date(c.last_order_at as string).getTime() : 0,
    }));
    if (s(args.segment) === "repeat") rows = rows.filter((r) => r.orders > 1);
    if (s(args.segment) === "inactive") rows = rows.filter((r) => r._last && r._last < cutoff);
    return { store: st.name, customers: rows.map(({ _last, ...r }) => { void _last; return r; }) };
  },
};

const store_customer_detail: AdminToolDef = {
  name: "store_customer_detail",
  description: "Full detail for ONE customer in a store (by phone, email or name): lifetime stats, their order history and any returns.",
  risk: "read",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, customer: { type: "string" } },
    required: ["store", "customer"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const ref = s(args.customer);
    const { data: matches } = await db
      .from("customers")
      .select("id, name, phone, email, city, notes, total_orders, total_spent, first_order_at, last_order_at, created_at")
      .eq("business_id", st.id)
      .or(`name.ilike.%${ref}%,phone.ilike.%${ref}%,email.ilike.%${ref}%`)
      .limit(5);
    if (!matches?.length) return { error: `No customer matches "${ref}" in ${st.name}.` };
    if (matches.length > 1) return { error: `Several match: ${matches.map((m) => `${m.name} (${m.phone})`).join(", ")}.` };
    const c = matches[0];
    const [{ data: orders }, { data: returns }] = await Promise.all([
      db.from("orders").select("order_number, status, total, placed_at").eq("business_id", st.id).eq("customer_id", c.id).order("placed_at", { ascending: false }).limit(50),
      db.from("returns").select("return_number, status, refund_amount, created_at, orders!inner(customer_id)").eq("business_id", st.id).eq("orders.customer_id", c.id).limit(20),
    ]);
    return {
      store: st.name,
      name: c.name,
      phone: c.phone,
      email: c.email ?? null,
      city: c.city ?? null,
      notes: c.notes ?? null,
      lifetime: {
        orders: Number(c.total_orders ?? 0),
        spent: money(Number(c.total_spent ?? 0), st.currency),
        avgOrder: Number(c.total_orders ?? 0) ? money(Number(c.total_spent ?? 0) / Number(c.total_orders), st.currency) : money(0, st.currency),
        first: c.first_order_at ?? null,
        last: c.last_order_at ?? null,
      },
      orders: (orders ?? []).map((o) => ({ number: o.order_number, status: o.status, total: money(Number(o.total), st.currency), placed: o.placed_at })),
      returns: (returns ?? []).map((r) => ({ number: r.return_number, status: r.status, refund: money(Number(r.refund_amount), st.currency), at: r.created_at })),
    };
  },
};

const store_reviews: AdminToolDef = {
  name: "store_reviews",
  description: "A store's product reviews. Optional: status (pending/approved/hidden), minRating, limit. Includes the store's overall average.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      store: { type: "string" },
      status: { type: "string", enum: ["pending", "approved", "hidden"] },
      minRating: { type: "number" },
      limit: { type: "number" },
    },
    required: ["store"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    let q = db
      .from("product_reviews")
      .select("rating, title, body, reviewer_name, status, created_at, products(name)")
      .eq("business_id", st.id)
      .order("created_at", { ascending: false });
    if (s(args.status)) q = q.eq("status", s(args.status));
    if (nz(args.minRating) != null) q = q.gte("rating", nz(args.minRating)!);
    const { data } = await q.limit(Math.min(nz(args.limit) ?? 25, 100));
    const { data: all } = await db.from("product_reviews").select("rating").eq("business_id", st.id).eq("status", "approved");
    const avg = (all ?? []).length ? Number(((all ?? []).reduce((n, r) => n + Number(r.rating), 0) / (all ?? []).length).toFixed(1)) : null;
    return {
      store: st.name,
      overallAverage: avg,
      approvedCount: (all ?? []).length,
      reviews: (data ?? []).map((r) => ({
        product: ((Array.isArray(r.products) ? r.products[0] : r.products) as { name?: string } | null)?.name ?? "—",
        rating: Number(r.rating),
        title: r.title ?? null,
        body: r.body ?? null,
        by: r.reviewer_name ?? "Verified buyer",
        status: r.status,
        at: r.created_at,
      })),
    };
  },
};

const store_abandoned_carts: AdminToolDef = {
  name: "store_abandoned_carts",
  description:
    "A store's abandoned carts (by store name or id): cart sessions vs orders, abandon rate, sessions left at checkout, estimated cart value not purchased. Set list:true for the recent abandoned carts with the shopper's name/phone/email (when signed in — guests stay anonymous). Optional days (default 7).",
  risk: "read",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, days: { type: "number" }, list: { type: "boolean" } },
    required: ["store"],
  },
  async handler(_a, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const { getAbandonedCartSummary, getRecentCarts } = await import("@/lib/storefront/abandoned-cart");
    const days = Math.min(Math.max(Math.round(nz(args.days) ?? 7), 1), 90);
    const r = await getAbandonedCartSummary(st.id, new Date(Date.now() - days * DAY), new Date());
    const out: Record<string, unknown> = {
      store: st.name,
      period: `last ${days} days`,
      cartSessions: r.cartSessions,
      reachedCheckout: r.checkoutSessions,
      registeredShoppers: r.registeredCartSessions,
      ordersPlaced: r.orders,
      abandonedCarts: r.abandonedCarts,
      abandonedAtCheckout: r.abandonedCheckouts,
      cartAbandonRate: r.cartAbandonRate != null ? `${r.cartAbandonRate}%` : null,
      averageCartValue: money(r.avgCartValue, st.currency),
      estimatedValueLeftInCarts: money(r.estimatedLostValue, st.currency),
    };
    if (args.list === true) {
      const carts = await getRecentCarts(st.id, Math.min(days, 14), 30, true);
      out.recentCarts = carts
        .filter((c) => c.likelyAbandoned)
        .map((c) => ({
          shopper:
            c.shopper.type === "registered"
              ? { name: c.shopper.name, phone: c.shopper.phone ?? null, email: c.shopper.email ?? null }
              : "guest",
          items: c.items,
          value: money(c.value, st.currency),
          reachedCheckout: c.reachedCheckout,
          lastActive: c.lastActivity,
        }));
    }
    return out;
  },
};

/* ────────────────────────  action tools (confirmed)  ──────────────────── */

const set_store_status: AdminToolDef = {
  name: "set_store_status",
  description: "Suspend or reactivate a whole store. Suspending takes the storefront offline and the owner out of the app.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: {
      store: { type: "string" },
      status: { type: "string", enum: ["active", "suspended"] },
      reason: { type: "string" },
    },
    required: ["store", "status"],
  },
  async handler(adminId, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const status = s(args.status) === "suspended" ? "suspended" : "active";
    const db = getAdminSupabase();
    await db.from("businesses").update({ status }).eq("id", st.id);
    await writeAudit(st.id, adminId, "business.status_changed", `${st.name} → ${status}${s(args.reason) ? ` (${s(args.reason)})` : ""}`);
    return { store: st.name, status };
  },
};

const set_owner_assistant: AdminToolDef = {
  name: "set_owner_assistant",
  description: "Suspend or re-enable the store OWNER's Zotomic Assistant (the dashboard chat). Does not touch the storefront chatbot.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, suspended: { type: "boolean" }, reason: { type: "string" } },
    required: ["store", "suspended"],
  },
  async handler(adminId, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const suspended = args.suspended === true;
    await db
      .from("businesses")
      .update({ assistant_suspended: suspended, assistant_suspended_reason: suspended ? s(args.reason) || "Suspended by Zotomic." : null })
      .eq("id", st.id);
    await writeAudit(st.id, adminId, "owner_assistant.suspended", `${st.name} owner assistant ${suspended ? "suspended" : "re-enabled"}`);
    return { store: st.name, ownerAssistantSuspended: suspended };
  },
};

const set_storefront_assistant: AdminToolDef = {
  name: "set_storefront_assistant",
  description:
    "Change a store's storefront chatbot: suspend/unsuspend it, turn it on/off, or edit its display name / opening greeting. Provide only the fields to change.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: {
      store: { type: "string" },
      suspended: { type: "boolean" },
      suspendedReason: { type: "string" },
      enabled: { type: "boolean" },
      name: { type: "string" },
      greeting: { type: "string" },
    },
    required: ["store"],
  },
  async handler(adminId, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const row: Record<string, unknown> = { business_id: st.id, updated_at: new Date().toISOString() };
    const done: string[] = [];
    if (typeof args.suspended === "boolean") {
      row.suspended = args.suspended;
      row.suspended_reason = args.suspended ? s(args.suspendedReason) || "Suspended by Zotomic." : null;
      done.push(args.suspended ? "suspended" : "unsuspended");
    }
    if (typeof args.enabled === "boolean") {
      row.enabled = args.enabled;
      done.push(args.enabled ? "enabled" : "disabled");
    }
    if (s(args.name)) {
      row.name = s(args.name).slice(0, 60);
      done.push("renamed");
    }
    if (s(args.greeting)) {
      row.greeting = s(args.greeting).slice(0, 400);
      done.push("greeting updated");
    }
    if (done.length === 1 && "business_id" in row && Object.keys(row).length === 2) return { error: "Nothing to change." };
    await db.from("storefront_assistant_config").upsert(row, { onConflict: "business_id" });
    await writeAudit(st.id, adminId, "storefront_assistant.admin_edit", `${st.name} storefront assistant: ${done.join(", ")}`);
    return { store: st.name, changed: done };
  },
};

const edit_storefront_knowledge: AdminToolDef = {
  name: "edit_storefront_knowledge",
  description: "Add or remove a knowledge Q&A entry on a store's storefront assistant (support fixes). Pass add {question, answer} or removeId.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: {
      store: { type: "string" },
      add: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" } } },
      removeId: { type: "string" },
    },
    required: ["store"],
  },
  async handler(adminId, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const add = args.add as { question?: unknown; answer?: unknown } | undefined;
    if (add && s(add.question) && s(add.answer)) {
      await db.from("storefront_assistant_knowledge").insert({
        business_id: st.id,
        question: s(add.question).slice(0, 300),
        answer: s(add.answer).slice(0, 2000),
      });
      await writeAudit(st.id, adminId, "storefront_assistant.admin_edit", `${st.name}: added a knowledge entry`);
      return { store: st.name, added: true };
    }
    if (s(args.removeId)) {
      await db.from("storefront_assistant_knowledge").delete().eq("business_id", st.id).eq("id", s(args.removeId));
      await writeAudit(st.id, adminId, "storefront_assistant.admin_edit", `${st.name}: removed a knowledge entry`);
      return { store: st.name, removed: true };
    }
    return { error: "Pass add {question, answer} or removeId." };
  },
};

const set_storefront_signals: AdminToolDef = {
  name: "set_storefront_signals",
  description: "Set which live signals a store's storefront assistant may surface: bestseller, sale, campaign, hot (each true/false).",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: {
      store: { type: "string" },
      signals: {
        type: "object",
        properties: {
          bestseller: { type: "boolean" },
          sale: { type: "boolean" },
          campaign: { type: "boolean" },
          hot: { type: "boolean" },
        },
      },
    },
    required: ["store", "signals"],
  },
  async handler(adminId, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const db = getAdminSupabase();
    const signals = normalizeSignals(args.signals as Record<string, unknown>);
    await db.from("storefront_assistant_config").upsert(
      { business_id: st.id, signals, updated_at: new Date().toISOString() },
      { onConflict: "business_id" },
    );
    await writeAudit(st.id, adminId, "storefront_assistant.admin_edit", `${st.name}: signals ${JSON.stringify(signals)}`);
    return { store: st.name, signals };
  },
};

const grant_assistant_credits: AdminToolDef = {
  name: "grant_assistant_credits",
  description: "Add (or subtract, with a negative number) assistant credits to a store's purchased balance. Writes the credit ledger.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, amount: { type: "number" }, note: { type: "string" } },
    required: ["store", "amount"],
  },
  async handler(adminId, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const amount = Math.round(nz(args.amount) ?? 0);
    if (!amount) return { error: "Amount must be non-zero." };
    const db = getAdminSupabase();
    const { data: acc } = await db
      .from("credit_accounts")
      .select("allowance_balance, purchased_balance, lifetime_purchased")
      .eq("business_id", st.id)
      .maybeSingle();
    const purchased = Number(acc?.purchased_balance ?? 0) + amount;
    const balanceAfter = Number(acc?.allowance_balance ?? 0) + purchased;
    await db.from("credit_accounts").upsert(
      {
        business_id: st.id,
        purchased_balance: purchased,
        lifetime_purchased: Number(acc?.lifetime_purchased ?? 0) + Math.max(0, amount),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id" },
    );
    await db.from("credit_ledger").insert({
      business_id: st.id,
      delta: amount,
      reason: "admin_adjust",
      balance_after: balanceAfter,
      actor_id: adminId,
      actor_type: "admin",
      meta: { note: s(args.note) || "admin assistant grant", via: "admin_assistant" },
    });
    await writeAudit(st.id, adminId, "credits.admin_grant", `${st.name}: ${amount > 0 ? "+" : ""}${amount} credits`);
    return { store: st.name, granted: amount, purchasedBalance: purchased };
  },
};

const grant_storefront_conversations: AdminToolDef = {
  name: "grant_storefront_conversations",
  description: "Add (or subtract) storefront-chat conversations to a store's campaign top-up pool.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, amount: { type: "number" } },
    required: ["store", "amount"],
  },
  async handler(adminId, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const amount = Math.round(nz(args.amount) ?? 0);
    if (!amount) return { error: "Amount must be non-zero." };
    const db = getAdminSupabase();
    const { data: cfg } = await db.from("storefront_assistant_config").select("extra_conversations").eq("business_id", st.id).maybeSingle();
    const next = Math.max(0, Number(cfg?.extra_conversations ?? 0) + amount);
    await db.from("storefront_assistant_config").upsert(
      { business_id: st.id, extra_conversations: next, updated_at: new Date().toISOString() },
      { onConflict: "business_id" },
    );
    await writeAudit(st.id, adminId, "storefront_assistant.admin_edit", `${st.name}: top-up pool ${amount > 0 ? "+" : ""}${amount} → ${next}`);
    return { store: st.name, pool: next };
  },
};

const resolve_payment: AdminToolDef = {
  name: "resolve_payment",
  description:
    "Grant or reject a pending payment from pending_payments. kind 'credit' = an assistant-credit pack; kind 'storefront_chat' = a storefront-chat top-up. Granting credits the store.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: {
      purchaseId: { type: "string" },
      kind: { type: "string", enum: ["credit", "storefront_chat"] },
      action: { type: "string", enum: ["grant", "reject"] },
    },
    required: ["purchaseId", "kind", "action"],
  },
  async handler(adminId, args) {
    const db = getAdminSupabase();
    const id = s(args.purchaseId);
    const grant = s(args.action) === "grant";

    if (s(args.kind) === "storefront_chat") {
      const { data: p } = await db.from("storefront_chat_purchases").select("id, business_id, conversations, status").eq("id", id).maybeSingle();
      if (!p || p.status !== "submitted") return { error: "Not a pending storefront-chat top-up." };
      if (grant) {
        const { data: cfg } = await db.from("storefront_assistant_config").select("extra_conversations").eq("business_id", p.business_id).maybeSingle();
        await db.from("storefront_assistant_config").upsert(
          { business_id: p.business_id, extra_conversations: Number(cfg?.extra_conversations ?? 0) + Number(p.conversations), updated_at: new Date().toISOString() },
          { onConflict: "business_id" },
        );
      }
      await db.from("storefront_chat_purchases").update({ status: grant ? "granted" : "rejected", resolved_by: adminId, resolved_at: new Date().toISOString() }).eq("id", id);
      await writeAudit(p.business_id as string, adminId, "storefront_chat_topup.resolved", `${grant ? "granted" : "rejected"} ${p.conversations} conversations`);
      return { resolved: grant ? "granted" : "rejected", conversations: Number(p.conversations) };
    }

    const { data: p } = await db.from("credit_purchases").select("id, business_id, credits, status").eq("id", id).maybeSingle();
    if (!p || p.status !== "submitted") return { error: "Not a pending credit pack." };
    if (grant) {
      const { data: acc } = await db.from("credit_accounts").select("allowance_balance, purchased_balance, lifetime_purchased").eq("business_id", p.business_id).maybeSingle();
      const purchased = Number(acc?.purchased_balance ?? 0) + Number(p.credits);
      await db.from("credit_accounts").upsert(
        {
          business_id: p.business_id,
          purchased_balance: purchased,
          lifetime_purchased: Number(acc?.lifetime_purchased ?? 0) + Number(p.credits),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );
      await db.from("credit_ledger").insert({
        business_id: p.business_id,
        delta: Number(p.credits),
        reason: "purchase",
        balance_after: Number(acc?.allowance_balance ?? 0) + purchased,
        actor_id: adminId,
        actor_type: "admin",
        meta: { purchase_id: id, via: "admin_assistant" },
      });
    }
    await db.from("credit_purchases").update({ status: grant ? "granted" : "rejected", resolved_by: adminId, resolved_at: new Date().toISOString() }).eq("id", id);
    await writeAudit(p.business_id as string, adminId, "credits.purchase_resolved", `${grant ? "granted" : "rejected"} ${p.credits} credits`);
    return { resolved: grant ? "granted" : "rejected", credits: Number(p.credits) };
  },
};

const set_store_plan: AdminToolDef = {
  name: "set_store_plan",
  description: "Change a store's subscription plan (free/business/pro). Optionally extend the period by N days.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: {
      store: { type: "string" },
      plan: { type: "string", enum: ["free", "business", "pro"] },
      extendDays: { type: "number" },
      note: { type: "string" },
    },
    required: ["store", "plan"],
  },
  async handler(adminId, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    const plan = (["free", "business", "pro"].includes(s(args.plan)) ? s(args.plan) : "free") as PlanId;
    const db = getAdminSupabase();
    const { data: sub } = await db.from("subscriptions").select("id, current_period_end").eq("business_id", st.id).maybeSingle();
    const extend = Math.max(0, Math.round(nz(args.extendDays) ?? 0));
    const base = sub?.current_period_end ? new Date(sub.current_period_end + "T00:00:00Z") : new Date();
    if (extend) base.setDate(base.getDate() + extend);
    const values = {
      plan,
      current_period_end: extend ? base.toISOString().slice(0, 10) : sub?.current_period_end ?? null,
      updated_at: new Date().toISOString(),
    };
    if (sub) await db.from("subscriptions").update(values).eq("id", sub.id);
    else await db.from("subscriptions").insert({ business_id: st.id, ...values, status: "active", current_period_start: new Date().toISOString().slice(0, 10) });
    await writeAudit(st.id, adminId, "subscription.admin_change", `${st.name} → ${plan}${extend ? ` (+${extend}d)` : ""}${s(args.note) ? ` — ${s(args.note)}` : ""}`);
    return { store: st.name, plan, planName: PLANS.find((p) => p.id === plan)?.name };
  },
};

const message_store_owner: AdminToolDef = {
  name: "message_store_owner",
  description: "Send a notification to a store owner's dashboard (an admin → owner note). Not an email.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: { store: { type: "string" }, title: { type: "string" }, body: { type: "string" } },
    required: ["store", "title", "body"],
  },
  async handler(adminId, args) {
    const st = await resolveStore(s(args.store));
    if ("error" in st) return st;
    if (!s(args.title) || !s(args.body)) return { error: "Give a title and body." };
    const db = getAdminSupabase();
    await db.from("notifications").insert({
      business_id: st.id,
      type: "admin_message",
      title: s(args.title).slice(0, 120),
      body: s(args.body).slice(0, 600),
      href: "/app",
    });
    await writeAudit(st.id, adminId, "admin.owner_message", `Sent "${s(args.title)}" to ${st.name}`);
    return { store: st.name, sent: true };
  },
};

/* ────────────────────────  user management  ──────────────────────── */

const list_users: AdminToolDef = {
  name: "list_users",
  description:
    "Find platform users (store owners, staff, admins). Filter by email/name text, role (owner/staff/admin) or state (active/suspended/blocked). Returns role, state, stores and last login.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      role: { type: "string", enum: ["owner", "staff", "admin"] },
      state: { type: "string", enum: ["active", "suspended", "blocked"] },
      limit: { type: "number" },
    },
  },
  async handler(_a, args) {
    const db = getAdminSupabase();
    let q = db
      .from("users")
      .select("id, name, email, role, status, blocked, last_login, last_ip")
      .order("created_at", { ascending: false });
    if (s(args.query)) q = q.or(`email.ilike.%${s(args.query)}%,name.ilike.%${s(args.query)}%`);
    if (s(args.role)) q = q.eq("role", s(args.role));
    const { data } = await q.limit(Math.min(nz(args.limit) ?? 25, 100));
    let rows = (data ?? []).map((u) => ({
      email: u.email as string,
      name: u.name as string,
      role: u.role as string,
      state: u.blocked ? "blocked" : (u.status as string) === "suspended" ? "suspended" : "active",
      lastLogin: u.last_login ?? null,
      lastIp: (u.last_ip as string) ?? null,
    }));
    if (s(args.state)) rows = rows.filter((r) => r.state === s(args.state));
    return { users: rows };
  },
};

const user_detail: AdminToolDef = {
  name: "user_detail",
  description: "Everything about ONE user (by email or id): role, state, stores they belong to, last login + IP, and their recent login attempts.",
  risk: "read",
  parameters: { type: "object", properties: { user: { type: "string" } }, required: ["user"] },
  async handler(_a, args) {
    const u = await resolveUser(s(args.user));
    if ("error" in u) return u;
    const db = getAdminSupabase();
    const [{ data: members }, { data: events }, { data: full }] = await Promise.all([
      db.from("business_members").select("role, businesses(name)").eq("user_id", u.id),
      db.from("user_login_events").select("outcome, ip, created_at").eq("user_id", u.id).order("created_at", { ascending: false }).limit(10),
      db.from("users").select("blocked_reason, notes, last_login, created_at").eq("id", u.id).single(),
    ]);
    return {
      name: u.name,
      email: u.email,
      role: u.role,
      state: u.blocked ? "blocked" : u.status === "suspended" ? "suspended" : "active",
      blockedReason: full?.blocked_reason ?? null,
      notes: full?.notes ?? null,
      joined: full?.created_at,
      lastLogin: full?.last_login ?? null,
      lastIp: u.last_ip,
      stores: (members ?? []).map((m) => ({
        name: ((Array.isArray(m.businesses) ? m.businesses[0] : m.businesses) as { name?: string } | null)?.name ?? "—",
        role: m.role,
      })),
      recentLogins: (events ?? []).map((e) => ({ outcome: e.outcome, ip: e.ip, at: e.created_at })),
    };
  },
};

const set_user_state: AdminToolDef = {
  name: "set_user_state",
  description: "Suspend or reactivate a user account (by email or id). Suspended users can't sign in.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: { user: { type: "string" }, state: { type: "string", enum: ["active", "suspended"] } },
    required: ["user", "state"],
  },
  async handler(adminId, args) {
    const u = await resolveUser(s(args.user));
    if ("error" in u) return u;
    if (u.id === adminId) return { error: "That's your own account." };
    const status = s(args.state) === "suspended" ? "suspended" : "active";
    await getAdminSupabase().from("users").update({ status, updated_at: new Date().toISOString() }).eq("id", u.id);
    await writeUserAudit(adminId, "user.status", `${u.email} → ${status}`, u.id);
    return { user: u.email, state: status };
  },
};

const set_user_blocked: AdminToolDef = {
  name: "set_user_blocked",
  description:
    "Block or unblock a user (harder than suspend — an active session ends on the next request). Optionally also block the IP address they last logged in from.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: {
      user: { type: "string" },
      blocked: { type: "boolean" },
      reason: { type: "string" },
      alsoBlockIp: { type: "boolean" },
    },
    required: ["user", "blocked"],
  },
  async handler(adminId, args) {
    const u = await resolveUser(s(args.user));
    if ("error" in u) return u;
    if (u.id === adminId) return { error: "That's your own account." };
    const blocked = args.blocked === true;
    const db = getAdminSupabase();
    await db
      .from("users")
      .update({
        blocked,
        blocked_reason: blocked ? s(args.reason) || "Blocked by Zotomic." : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", u.id);
    let ip: string | null = null;
    if (blocked && args.alsoBlockIp === true && u.last_ip) {
      await db.from("blocked_ips").upsert({ ip: u.last_ip, reason: `User ${u.email}`, blocked_by: adminId }, { onConflict: "ip" });
      const { invalidateBlockedIpCache } = await import("@/lib/admin/security");
      invalidateBlockedIpCache();
      ip = u.last_ip;
    }
    await writeUserAudit(adminId, "user.blocked", `${u.email} ${blocked ? "blocked" : "unblocked"}${ip ? ` + IP ${ip}` : ""}`, u.id);
    return { user: u.email, blocked, blockedIp: ip };
  },
};

const block_ip: AdminToolDef = {
  name: "block_ip",
  description: "Block an IPv4 address or CIDR range (e.g. 203.0.113.4 or 203.0.113.0/24) from signing in or signing up. Pass unblock:true to remove it.",
  risk: "consequential",
  parameters: {
    type: "object",
    properties: { ip: { type: "string" }, reason: { type: "string" }, unblock: { type: "boolean" } },
    required: ["ip"],
  },
  async handler(adminId, args) {
    const ip = s(args.ip);
    if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(ip)) return { error: "Not a valid IPv4 address or CIDR." };
    const db = getAdminSupabase();
    if (args.unblock === true) {
      await db.from("blocked_ips").delete().ilike("ip", ip);
    } else {
      await db.from("blocked_ips").upsert({ ip, reason: s(args.reason) || null, blocked_by: adminId }, { onConflict: "ip" });
    }
    const { invalidateBlockedIpCache } = await import("@/lib/admin/security");
    invalidateBlockedIpCache();
    await writeUserAudit(adminId, args.unblock ? "ip.unblocked" : "ip.blocked", `${args.unblock ? "Unblocked" : "Blocked"} IP ${ip}`);
    return { ip, blocked: args.unblock !== true };
  },
};

/* ─────────────────────────────  registry  ───────────────────────────── */

export const ADMIN_TOOLS: AdminToolDef[] = [
  list_users,
  user_detail,
  set_user_state,
  set_user_blocked,
  block_ip,
  platform_overview,
  list_stores,
  store_detail,
  assistant_usage,
  pending_payments,
  flagged_activity,
  get_store_assistant_config,
  store_products,
  store_product_detail,
  store_categories,
  store_inventory,
  store_orders,
  store_order_detail,
  store_returns,
  store_customers,
  store_customer_detail,
  store_reviews,
  store_abandoned_carts,
  set_store_status,
  set_owner_assistant,
  set_storefront_assistant,
  edit_storefront_knowledge,
  set_storefront_signals,
  grant_assistant_credits,
  grant_storefront_conversations,
  resolve_payment,
  set_store_plan,
  message_store_owner,
];

export const ADMIN_TOOL_MAP = new Map(ADMIN_TOOLS.map((t) => [t.name, t]));
