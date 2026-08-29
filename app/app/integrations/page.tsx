import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getEntitlements } from "@/lib/entitlements";
import { listIntegrations, PAYMENT_PROVIDERS, COURIER_PROVIDERS } from "@/lib/adapters/registry";
import { PageHeader } from "@/components/app/PageHeader";
import { IntegrationSection } from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const [ent, connected] = await Promise.all([
    getEntitlements(tenant.businessId),
    listIntegrations(tenant.businessId),
  ]);

  const toProvider = (p: { id: string; name: string; credentialFields: { key: string; label: string; type: "text" | "password" }[] }) => ({
    id: p.id,
    name: p.name,
    fields: p.credentialFields,
  });
  const conn = connected.map((c) => ({
    provider: c.provider,
    status: c.status,
    mode: c.mode,
    lastError: c.lastError,
    connectedAt: c.connectedAt,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integrations"
        subtitle="Connect your own courier and payment accounts. Credentials stay encrypted on our servers."
      />

      <IntegrationSection
        title="Courier / delivery"
        description="Book shipments straight from an order. Available on every plan."
        category="courier"
        providers={Object.values(COURIER_PROVIDERS).map(toProvider)}
        connected={conn}
      />

      <IntegrationSection
        title="Payment gateway"
        description="Accept online payments on your storefront alongside cash on delivery."
        category="payment"
        providers={Object.values(PAYMENT_PROVIDERS).map(toProvider)}
        connected={conn}
        locked={!ent.payment_gateway}
        lockMessage="Payment gateways unlock on the Business plan. Cash on delivery is always available."
      />
    </div>
  );
}
