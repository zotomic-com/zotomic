import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformSettings, PLATFORM_KEYS } from "@/lib/platform-settings";
import { SettingsFieldsForm } from "@/app/admin/website/SettingsFieldsForm";
import { WebhookSecretCard } from "./WebhookSecretCard";
import { PublishToggle } from "./PublishToggle";
import { SandboxToggle } from "./SandboxToggle";

export const dynamic = "force-dynamic";

function fieldsFor(keys: readonly (keyof typeof PLATFORM_KEYS)[], stored: Record<string, string>) {
  return keys
    .filter((k) => k !== "domain_reseller_enabled" && k !== "domain_sms_webhook_secret" && k !== "dynadot_use_sandbox")
    .map((key) => ({
      key,
      label: PLATFORM_KEYS[key].label,
      secret: PLATFORM_KEYS[key].secret,
      value: PLATFORM_KEYS[key].secret ? (stored[key] ? "••••••••" : "") : (stored[key] ?? ""),
    }));
}

export default async function AdminDomainSettingsPage() {
  await requireAdmin();
  const stored = await getPlatformSettings();
  const enabled = stored.domain_reseller_enabled === "true";
  const sandbox = stored.dynadot_use_sandbox === "true";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com").replace(/\/$/, "");

  return (
    <div className="space-y-5">
      <PageHeader title="Domain reseller settings" subtitle="API credentials, payment numbers, pricing, and the publish toggle for /domains." />

      <Card>
        <CardHeader>
          <CardTitle>Publish /domains</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            While unpublished, <code className="rounded-sm bg-surface-2 px-1">{siteUrl}/domains</code> shows a normal 404.
            Everything below can be configured either way — flip this on when you&apos;re ready to take real orders.
          </p>
          <PublishToggle enabled={enabled} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dynadot mode</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            While in sandbox mode, every domain search/order/fulfillment call goes to Dynadot&apos;s test environment —
            nothing is charged and no real domain is registered. Switch to live only once you&apos;ve verified the
            sandbox flow end-to-end.
          </p>
          <SandboxToggle sandbox={sandbox} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dynadot sandbox credentials</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">From Dynadot → Tools → API, with sandbox enabled. Used only while sandbox mode is on above.</p>
          <SettingsFieldsForm fields={fieldsFor(["dynadot_sandbox_api_key", "dynadot_sandbox_api_secret"], stored)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dynadot live credentials</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">Real API key and secret — these move real money once live mode is switched on above.</p>
          <SettingsFieldsForm fields={fieldsFor(["dynadot_api_key", "dynadot_api_secret"], stored)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cloudflare (DNS + email)</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            Pasted here, not in environment variables — encrypted at rest the same way every other integration on this
            platform stores credentials.
          </p>
          <SettingsFieldsForm fields={fieldsFor(["cloudflare_api_token", "cloudflare_account_id"], stored)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receiving payments</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">Personal bKash/Nagad numbers customers send their invoice amount to.</p>
          <SettingsFieldsForm fields={fieldsFor(["domain_bkash_number", "domain_nagad_number"], stored)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            Retail price = wholesale (USD, from Dynadot) × the exchange rate below × (1 + markup), rounded to the
            nearest ৳10.
          </p>
          <SettingsFieldsForm fields={fieldsFor(["domain_markup_percent", "domain_usd_to_bdt_rate", "domain_grace_days"], stored)} />
        </CardBody>
      </Card>

      <WebhookSecretCard siteUrl={siteUrl} hasSecret={!!stored.domain_sms_webhook_secret} />
    </div>
  );
}
