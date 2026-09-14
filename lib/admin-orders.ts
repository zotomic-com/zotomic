import { getAdminSupabase } from "@/lib/supabase";

export type OrderType = "domain" | "service_inquiry" | "subscription_payment" | "credit_topup" | "chat_topup";

export interface OrderFeedItem {
  id: string;
  type: OrderType;
  title: string;
  subtitle: string;
  amount: string | null;
  statusLabel: string;
  statusTone: "neutral" | "success" | "danger" | "warning" | "info";
  href: string;
  at: string;
}

export interface OrdersOverview {
  counts: {
    domainOrders: number;
    pendingSubscriptionPayments: number;
    pendingCreditTopups: number;
    newServiceInquiries: number;
  };
  feed: OrderFeedItem[];
}

const money = (amount: number, currency: string) => `${currency === "BDT" ? "৳" : currency + " "}${amount.toLocaleString("en-US")}`;

type BizName = { name?: string } | null;
const nameOf = (b: unknown) => ((Array.isArray(b) ? b[0] : b) as BizName)?.name ?? "a store";

/** Pulls recent activity + needs-attention counts from every order source into one feed. Read-only — every action still lives on its own dedicated admin page. */
export async function getOrdersOverview(): Promise<OrdersOverview> {
  const db = getAdminSupabase();

  const [{ data: domains }, { data: inquiries }, { data: invoices }, { data: credits }, { data: chatTopups }] = await Promise.all([
    db
      .from("domain_cart_orders")
      .select("id, order_number, customer_name, invoice_amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    db
      .from("service_inquiries")
      .select("id, service, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    db
      .from("invoices")
      .select("id, invoice_number, amount, currency, txn_submitted_at, businesses(name)")
      .eq("status", "open")
      .not("txn_submitted_at", "is", null)
      .order("txn_submitted_at", { ascending: false })
      .limit(15),
    db
      .from("credit_purchases")
      .select("id, credits, amount, currency, submitted_at, businesses(name)")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(15),
    db
      .from("storefront_chat_purchases")
      .select("id, conversations, amount, currency, submitted_at, businesses(name)")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(15),
  ]);

  const feed: OrderFeedItem[] = [
    ...(domains ?? []).map((d) => ({
      id: `domain-${d.id}`,
      type: "domain" as const,
      title: `Domain order — ${d.order_number}`,
      subtitle: d.customer_name as string,
      amount: money(Number(d.invoice_amount), "BDT"),
      statusLabel: d.status as string,
      statusTone: d.status === "failed" ? ("danger" as const) : d.status === "active" ? ("success" as const) : ("warning" as const),
      href: "/admin/domains",
      at: d.created_at as string,
    })),
    ...(inquiries ?? []).map((i) => ({
      id: `inquiry-${i.id}`,
      type: "service_inquiry" as const,
      title: `Service inquiry — ${i.service}`,
      subtitle: (i.message as string).slice(0, 80),
      amount: null,
      statusLabel: i.status as string,
      statusTone: i.status === "closed" ? ("success" as const) : i.status === "contacted" ? ("neutral" as const) : ("warning" as const),
      href: "/admin/service-inquiries",
      at: i.created_at as string,
    })),
    ...(invoices ?? []).map((inv) => ({
      id: `invoice-${inv.id}`,
      type: "subscription_payment" as const,
      title: `Subscription payment — ${nameOf(inv.businesses)}`,
      subtitle: `Invoice ${inv.invoice_number}`,
      amount: money(Number(inv.amount), (inv.currency as string) ?? "BDT"),
      statusLabel: "pending confirmation",
      statusTone: "warning" as const,
      href: "/admin/subscriptions",
      at: inv.txn_submitted_at as string,
    })),
    ...(credits ?? []).map((c) => ({
      id: `credit-${c.id}`,
      type: "credit_topup" as const,
      title: `Assistant credit top-up — ${nameOf(c.businesses)}`,
      subtitle: `${Number(c.credits).toLocaleString("en-US")} credits`,
      amount: money(Number(c.amount), (c.currency as string) ?? "BDT"),
      statusLabel: "pending confirmation",
      statusTone: "warning" as const,
      href: "/admin/credits",
      at: c.submitted_at as string,
    })),
    ...(chatTopups ?? []).map((t) => ({
      id: `chat-${t.id}`,
      type: "chat_topup" as const,
      title: `Storefront-chat top-up — ${nameOf(t.businesses)}`,
      subtitle: `${Number(t.conversations).toLocaleString("en-US")} conversations`,
      amount: money(Number(t.amount), (t.currency as string) ?? "BDT"),
      statusLabel: "pending confirmation",
      statusTone: "warning" as const,
      href: "/admin/storefront-assistants",
      at: t.submitted_at as string,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    counts: {
      domainOrders: (domains ?? []).length,
      pendingSubscriptionPayments: (invoices ?? []).length,
      pendingCreditTopups: (credits ?? []).length + (chatTopups ?? []).length,
      newServiceInquiries: (inquiries ?? []).filter((i) => i.status === "new").length,
    },
    feed: feed.slice(0, 30),
  };
}
