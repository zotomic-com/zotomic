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

/* ─────────────────────────────  registry  ───────────────────────────── */

export const ADMIN_TOOLS: AdminToolDef[] = [
  platform_overview,
  list_stores,
  store_detail,
  assistant_usage,
  pending_payments,
  flagged_activity,
  get_store_assistant_config,
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
