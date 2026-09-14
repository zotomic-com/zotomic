import Link from "next/link";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ServiceInquiryActions } from "./ServiceInquiryActions";

export const dynamic = "force-dynamic";

const SERVICE_FILTERS = [
  { value: "all", label: "All services" },
  { value: "hosting", label: "Hosting" },
  { value: "custom_website", label: "Custom Website" },
  { value: "automation", label: "Automation" },
] as const;

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
] as const;

const SERVICE_LABEL: Record<string, string> = {
  hosting: "Hosting",
  custom_website: "Custom Website",
  automation: "Automation",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning"> = {
  new: "warning",
  contacted: "neutral",
  closed: "success",
};

interface Row {
  id: string;
  service: string;
  message: string;
  contactPhone: string | null;
  contactEmail: string | null;
  fromName: string | null;
  status: string;
  createdAt: string;
}

export default async function ServiceInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; status?: string }>;
}) {
  await requireAdmin();
  const { service: rawService, status: rawStatus } = await searchParams;
  const service = SERVICE_FILTERS.some((f) => f.value === rawService) ? (rawService as string) : "all";
  const status = STATUS_FILTERS.some((f) => f.value === rawStatus) ? (rawStatus as string) : "all";

  const db = adminDb();
  let query = db
    .from("service_inquiries")
    .select("id, service, message, contact_phone, contact_email, status, created_at, users(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (service !== "all") query = query.eq("service", service);
  if (status !== "all") query = query.eq("status", status);
  const { data } = await query;

  const rows: Row[] = (data ?? []).map((r) => ({
    id: r.id as string,
    service: r.service as string,
    message: r.message as string,
    contactPhone: (r.contact_phone as string) ?? null,
    contactEmail: (r.contact_email as string) ?? null,
    fromName: ((Array.isArray(r.users) ? r.users[0] : r.users) as { name?: string } | null)?.name ?? null,
    status: r.status as string,
    createdAt: r.created_at as string,
  }));

  const cols: Column<Row>[] = [
    {
      key: "service",
      header: "Service",
      render: (r) => <Badge tone="primary">{SERVICE_LABEL[r.service] ?? r.service}</Badge>,
    },
    {
      key: "message",
      header: "Message",
      render: (r) => (
        <div>
          <p className="max-w-md truncate text-fg" title={r.message}>
            {r.message}
          </p>
          {r.fromName && <p className="text-xs text-fg-subtle">from {r.fromName}</p>}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (r) => (
        <div className="text-xs">
          {r.contactEmail && <p>{r.contactEmail}</p>}
          {r.contactPhone && <p className="text-fg-subtle">{r.contactPhone}</p>}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Submitted",
      render: (r) => <span className="text-xs text-fg-subtle">{new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => <ServiceInquiryActions id={r.id} status={r.status} />,
    },
  ];

  const pillClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      active ? "border-primary bg-primary-soft text-primary" : "border-border text-fg-subtle hover:text-fg"
    }`;

  return (
    <div className="space-y-5">
      <PageHeader title="Service inquiries" subtitle="Hosting, Custom Website, and Automation requests from tenants." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {SERVICE_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={`/admin/service-inquiries?service=${f.value}${status === "all" ? "" : `&status=${status}`}`}
              className={pillClass(service === f.value)}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={`/admin/service-inquiries?status=${f.value}${service === "all" ? "" : `&service=${service}`}`}
              className={pillClass(status === f.value)}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardBody className="p-0">
          <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No inquiries yet" }} />
        </CardBody>
      </Card>
    </div>
  );
}
