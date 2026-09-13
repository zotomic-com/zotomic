import Link from "next/link";
import { Settings2, ArrowLeft } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getAllPricingRules } from "@/lib/domains/pricing-rules";
import { getTldReferencePrices, getPricingContext, retailPriceBDT, SUGGESTED_TLDS } from "@/lib/domains/orders";
import { OrdersTable } from "./OrdersTable";
import { PricingRulesEditor } from "./PricingRulesEditor";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "domains", label: "Domains" },
  { value: "customers", label: "Customers" },
  { value: "pricing", label: "Pricing" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "transferring", label: "Transferring" },
  { value: "active", label: "Active" },
  { value: "renewed", label: "Renewed" },
  { value: "grace", label: "Grace" },
  { value: "dropped", label: "Dropped" },
  { value: "failed", label: "Failed" },
] as const;

const STATUS_TONE: Record<string, "neutral" | "success" | "danger" | "warning" | "info"> = {
  pending: "warning",
  registering: "info",
  transferring: "info",
  active: "success",
  grace: "warning",
  dropped: "danger",
  failed: "danger",
  cancelled: "neutral",
};

interface ItemRow {
  id: string;
  cartOrderId: string;
  orderNumber: string;
  domainName: string;
  itemType: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  pointTo: string;
  status: string;
  orderStatus: string;
  paymentMethod: string;
  retailPrice: number;
  wholesaleCost: number;
  invoiceAmount: number;
  expiresAt: string | null;
  lastError: string | null;
  createdAt: string;
  renewalCount: number;
}

async function fetchDomainItems(): Promise<ItemRow[]> {
  const { data } = await adminDb()
    .from("domain_cart_items")
    .select("*, domain_cart_orders(order_number, customer_name, customer_phone, customer_email, payment_method, invoice_amount, status)")
    .order("created_at", { ascending: false })
    .limit(500);

  return (data ?? []).map((row) => {
    const order = (row.domain_cart_orders ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      cartOrderId: row.cart_order_id as string,
      orderNumber: (order.order_number as string) ?? "",
      domainName: row.domain_name as string,
      itemType: row.item_type as string,
      customerName: (order.customer_name as string) ?? "",
      customerPhone: (order.customer_phone as string) ?? "",
      customerEmail: (order.customer_email as string) ?? "",
      pointTo: (row.point_to as string) ?? "self",
      status: row.status as string,
      orderStatus: (order.status as string) ?? "",
      paymentMethod: (order.payment_method as string) ?? "",
      retailPrice: Number(row.retail_price),
      wholesaleCost: Number(row.wholesale_cost ?? 0),
      invoiceAmount: Number(order.invoice_amount ?? 0),
      expiresAt: (row.expires_at as string) ?? null,
      lastError: (row.last_error as string) ?? null,
      createdAt: row.created_at as string,
      renewalCount: Number(row.renewal_count ?? 0),
    };
  });
}

function filterByStatus(items: ItemRow[], status: string): ItemRow[] {
  switch (status) {
    case "new":
      return items.filter((i) => i.status === "pending" || i.status === "registering");
    case "transferring":
      return items.filter((i) => i.status === "transferring");
    case "active":
      return items.filter((i) => i.status === "active" && i.renewalCount === 0);
    case "renewed":
      return items.filter((i) => i.status === "active" && i.renewalCount > 0);
    case "grace":
      return items.filter((i) => i.status === "grace");
    case "dropped":
      return items.filter((i) => i.status === "dropped");
    case "failed":
      return items.filter((i) => i.status === "failed");
    default:
      return items;
  }
}

async function DomainsTabContent({ status }: { status: string }) {
  const items = await fetchDomainItems();
  const filtered = filterByStatus(items, status);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/domains?tab=domains${f.value === "all" ? "" : `&status=${f.value}`}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              status === f.value ? "border-primary bg-primary-soft text-primary" : "border-border text-fg-subtle hover:text-fg"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <OrdersTable orders={filtered} />
    </div>
  );
}

interface CustomerRow {
  userId: string;
  name: string;
  email: string;
  phone: string;
  joinedAt: string;
  counts: Record<string, number>;
  total: number;
}

async function fetchCustomers(): Promise<CustomerRow[]> {
  const { data } = await adminDb()
    .from("domain_cart_orders")
    .select("user_id, customer_name, customer_phone, customer_email, users(id, name, email, created_at), domain_cart_items(status)")
    .not("user_id", "is", null)
    .limit(1000);

  const byUser = new Map<string, CustomerRow>();
  for (const row of data ?? []) {
    const userId = row.user_id as string;
    const user = (Array.isArray(row.users) ? row.users[0] : row.users) as Record<string, unknown> | null;
    const items = (row.domain_cart_items ?? []) as { status: string }[];
    if (!byUser.has(userId)) {
      byUser.set(userId, {
        userId,
        name: (user?.name as string) ?? (row.customer_name as string) ?? "—",
        email: (user?.email as string) ?? (row.customer_email as string) ?? "",
        phone: (row.customer_phone as string) ?? "",
        joinedAt: (user?.created_at as string) ?? "",
        counts: {},
        total: 0,
      });
    }
    const entry = byUser.get(userId)!;
    for (const item of items) {
      entry.counts[item.status] = (entry.counts[item.status] ?? 0) + 1;
      entry.total += 1;
    }
  }
  return [...byUser.values()].sort((a, b) => b.total - a.total);
}

async function CustomersTabContent() {
  const customers = await fetchCustomers();
  const cols: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Customer",
      render: (c) => (
        <div>
          <p className="font-medium text-fg">{c.name}</p>
          <p className="text-xs text-fg-subtle">{c.email || c.phone}</p>
        </div>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (c) => <span>{c.joinedAt ? new Date(c.joinedAt).toLocaleDateString() : "—"}</span>,
    },
    {
      key: "domains",
      header: "Domains",
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {Object.entries(c.counts).map(([status, n]) => (
            <Badge key={status} tone={STATUS_TONE[status] ?? "neutral"}>
              {n} {status}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (c) => (
        <Link href={`/admin/domains?tab=customers&customer=${c.userId}`} className="text-sm font-medium text-primary hover:underline">
          View
        </Link>
      ),
    },
  ];

  return (
    <Card>
      <DataTable columns={cols} rows={customers} rowKey={(c) => c.userId} empty={{ title: "No domain customers yet" }} />
    </Card>
  );
}

async function CustomerDetailContent({ userId }: { userId: string }) {
  const [{ data: user }, items] = await Promise.all([
    adminDb().from("users").select("id, name, email, created_at").eq("id", userId).maybeSingle(),
    fetchDomainItems(),
  ]);

  // fetchDomainItems() doesn't carry user_id — re-query directly scoped to this customer instead.
  const { data: rows } = await adminDb()
    .from("domain_cart_items")
    .select(
      "*, domain_cart_orders!inner(user_id, order_number, customer_name, customer_phone, customer_email, payment_method, invoice_amount, status)",
    )
    .eq("domain_cart_orders.user_id", userId)
    .order("created_at", { ascending: false });

  const domainRows: ItemRow[] = (rows ?? []).map((row) => {
    const order = (row.domain_cart_orders ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      cartOrderId: row.cart_order_id as string,
      orderNumber: (order.order_number as string) ?? "",
      domainName: row.domain_name as string,
      itemType: row.item_type as string,
      customerName: (order.customer_name as string) ?? "",
      customerPhone: (order.customer_phone as string) ?? "",
      customerEmail: (order.customer_email as string) ?? "",
      pointTo: (row.point_to as string) ?? "self",
      status: row.status as string,
      orderStatus: (order.status as string) ?? "",
      paymentMethod: (order.payment_method as string) ?? "",
      retailPrice: Number(row.retail_price),
      wholesaleCost: Number(row.wholesale_cost ?? 0),
      invoiceAmount: Number(order.invoice_amount ?? 0),
      expiresAt: (row.expires_at as string) ?? null,
      lastError: (row.last_error as string) ?? null,
      createdAt: row.created_at as string,
      renewalCount: Number(row.renewal_count ?? 0),
    };
  });
  void items; // fetched for parity/future use; the scoped query above is authoritative for this view

  return (
    <div className="space-y-3">
      <Link href="/admin/domains?tab=customers" className="inline-flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to customers
      </Link>
      <Card>
        <CardBody>
          <p className="font-bold text-fg">{user?.name ?? "Unknown"}</p>
          <p className="text-sm text-fg-subtle">{user?.email}</p>
          <p className="text-xs text-fg-subtle">Joined {user?.created_at ? new Date(user.created_at as string).toLocaleDateString() : "—"}</p>
        </CardBody>
      </Card>
      <OrdersTable orders={domainRows} />
    </div>
  );
}

async function PricingTabContent() {
  const [rules, ctx] = await Promise.all([getAllPricingRules(), getPricingContext()]);
  const tlds = [...new Set([...SUGGESTED_TLDS, ...rules.map((r) => r.tld)])];
  const reference = await getTldReferencePrices(tlds);

  const preview = tlds.map((tld) => {
    const ref = reference[tld] ?? { wholesaleUsd: null, wholesaleRenewalUsd: null };
    return {
      tld,
      wholesaleUsd: ref.wholesaleUsd,
      wholesaleRenewalUsd: ref.wholesaleRenewalUsd,
      sellingFirstYear: ref.wholesaleUsd != null ? retailPriceBDT(ref.wholesaleUsd, tld, "first_year", ctx) : null,
      sellingRenewal: ref.wholesaleRenewalUsd != null ? retailPriceBDT(ref.wholesaleRenewalUsd, tld, "renewal", ctx) : null,
    };
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex items-center justify-between text-sm">
          <span className="text-fg-muted">
            Live USD → BDT rate: <span className="font-mono font-semibold text-fg">{ctx.usdToBdtRate}</span>
          </span>
          <Badge tone={ctx.fxSource === "live" ? "success" : "warning"}>{ctx.fxSource === "live" ? "Live feed" : "Fallback rate"}</Badge>
        </CardBody>
      </Card>
      <PricingRulesEditor
        rules={rules}
        preview={preview}
        globalMarkupPercentFirstYear={ctx.markupPercentFirstYear}
        globalMarkupPercentRenewal={ctx.markupPercentRenewal}
      />
    </div>
  );
}

export default async function AdminDomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; customer?: string }>;
}) {
  await requireAdmin();
  const { tab: rawTab, status: rawStatus, customer: customerId } = await searchParams;
  const tab: TabValue = TABS.some((t) => t.value === rawTab) ? (rawTab as TabValue) : "domains";
  const status = rawStatus ?? "all";

  const settings = await getPlatformSettings();
  const enabled = settings.domain_reseller_enabled === "true";
  const sandbox = settings.dynadot_use_sandbox === "true";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Domains"
        subtitle="Every domain sold through /domains, from invoice to renewal."
        action={
          <Link href="/admin/domains/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Settings2 className="h-4 w-4" /> Settings
          </Link>
        }
      />
      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-fg-subtle">/domains is</span>
          <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Published" : "Unpublished"}</Badge>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-fg-subtle">Dynadot mode</span>
          <Badge tone={sandbox ? "warning" : "danger"}>{sandbox ? "Sandbox" : "Live"}</Badge>
        </span>
      </div>

      <div className="inline-flex gap-1 rounded-sm border border-border bg-surface-2 p-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/domains?tab=${t.value}`}
            className={`rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors ${
              t.value === tab ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "domains" && <DomainsTabContent status={status} />}
      {tab === "customers" && (customerId ? <CustomerDetailContent userId={customerId} /> : <CustomersTabContent />)}
      {tab === "pricing" && <PricingTabContent />}
    </div>
  );
}
