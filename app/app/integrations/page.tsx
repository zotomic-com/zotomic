import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getEntitlements } from "@/lib/entitlements";
import { listIntegrations, PAYMENT_PROVIDERS, COURIER_PROVIDERS } from "@/lib/adapters/registry";
import { MESSAGING_PROVIDERS, listChannels } from "@/lib/messaging";
import { getStoreTracking } from "@/lib/store-tracking";
import { PageHeader } from "@/components/app/PageHeader";
import { IntegrationSection } from "./IntegrationsClient";
import { MessagingSection } from "./MessagingClient";
import { TrackingSection } from "./TrackingClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const [ent, connected, channels, tracking] = await Promise.all([
    getEntitlements(tenant.businessId),
    listIntegrations(tenant.businessId),
    listChannels(tenant.businessId),
    getStoreTracking(tenant.businessId),
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

  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com").replace(/\/$/, "");
  const webhookUrl = `${siteBase}/api/webhooks/meta/${tenant.businessId}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integrations"
        subtitle="Connect your own courier, payment, messaging and analytics accounts. Credentials stay encrypted on our servers."
      />

      <TrackingSection
        pixelId={tracking.metaPixelId}
        ga4Id={tracking.ga4MeasurementId}
        capiConnected={!!tracking.metaCapiToken}
      />

      <MessagingSection
        webhookUrl={webhookUrl}
        providers={Object.values(MESSAGING_PROVIDERS).map((p) => ({
          id: p.id,
          name: p.name,
          blurb: p.blurb,
          fields: p.fields,
        }))}
        channels={channels.map((c) => ({
          provider: c.provider,
          status: c.status,
          verifyToken: c.verifyToken,
          lastEventAt: c.lastEventAt,
          lastError: c.lastError,
        }))}
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
