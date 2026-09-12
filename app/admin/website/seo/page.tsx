import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPlatformSettings, PLATFORM_KEYS } from "@/lib/platform-settings";
import { SettingsFieldsForm } from "../SettingsFieldsForm";

export const dynamic = "force-dynamic";

export default async function AdminWebsiteSeoPage() {
  await requireAdmin();
  const stored = await getPlatformSettings();

  const gscField = {
    key: "google_site_verification",
    label: "Verification code",
    secret: false,
    value: stored.google_site_verification ?? "",
    hint: "e.g. abcXYZ123...",
  };
  const trackingFields = ["meta_pixel_id", "ga4_measurement_id", "ga4_api_secret"].map((key) => ({
    key,
    label: PLATFORM_KEYS[key as keyof typeof PLATFORM_KEYS].label,
    secret: PLATFORM_KEYS[key as keyof typeof PLATFORM_KEYS].secret,
    value: PLATFORM_KEYS[key as keyof typeof PLATFORM_KEYS].secret ? (stored[key] ? "••••••••" : "") : (stored[key] ?? ""),
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="SEO & Search Console" subtitle="Verify zotomic.com with Google, and configure marketing-site tracking." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Google Search Console
            <Badge tone={gscField.value ? "success" : "neutral"}>{gscField.value ? "Verified" : "Not set up"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            In Search Console, add zotomic.com as a property, choose the <strong>HTML tag</strong> verification method,
            and copy just the <code className="rounded-sm bg-surface-2 px-1">content=&quot;...&quot;</code> value it gives you
            — not the whole tag. Paste it below and save; the tag is then emitted on every page automatically. Click
            &quot;Verify&quot; back in Search Console once this is live.
          </p>
          <SettingsFieldsForm fields={[gscField]} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>zotomic.com tracking</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            Meta Pixel (client-side) and Google Analytics 4 (client + server-side via the Measurement Protocol) for
            the marketing site only.
          </p>
          <SettingsFieldsForm fields={trackingFields} />
        </CardBody>
      </Card>
    </div>
  );
}
