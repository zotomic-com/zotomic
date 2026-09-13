import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformSettings, PLATFORM_KEYS } from "@/lib/platform-settings";
import { SettingsFieldsForm } from "@/app/admin/website/SettingsFieldsForm";
import { SocialToggle } from "./SocialToggle";

export const dynamic = "force-dynamic";

function fieldsFor(keys: readonly (keyof typeof PLATFORM_KEYS)[], stored: Record<string, string>) {
  return keys.map((key) => ({
    key,
    label: PLATFORM_KEYS[key].label,
    secret: PLATFORM_KEYS[key].secret,
    value: PLATFORM_KEYS[key].secret ? (stored[key] ? "••••••••" : "") : (stored[key] ?? ""),
  }));
}

export default async function AdminSocialLoginPage() {
  await requireAdmin();
  const stored = await getPlatformSettings();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com").replace(/\/$/, "");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Social login"
        subtitle="Let visitors sign up or log in with Google or Facebook — paste the credentials below, then publish."
      />

      <Card>
        <CardHeader>
          <CardTitle>Google</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            Create an OAuth client in the{" "}
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Google Cloud Console
            </a>{" "}
            (Credentials → Create Credentials → OAuth client ID → Web application), then register this exact callback URL:
          </p>
          <code className="block rounded-sm bg-surface-2 px-3 py-2 text-xs">{siteUrl}/api/auth/google/callback</code>
          <SettingsFieldsForm fields={fieldsFor(["oauth_google_client_id", "oauth_google_client_secret"], stored)} />
          <SocialToggle settingKey="oauth_google_enabled" enabled={stored.oauth_google_enabled === "true"} label="Google" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facebook</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            Create an app in{" "}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Meta for Developers
            </a>
            , add the Facebook Login product, switch the app to Live mode, then register this exact callback URL (App ID = client ID,
            App Secret = client secret below):
          </p>
          <code className="block rounded-sm bg-surface-2 px-3 py-2 text-xs">{siteUrl}/api/auth/facebook/callback</code>
          <SettingsFieldsForm fields={fieldsFor(["oauth_facebook_client_id", "oauth_facebook_client_secret"], stored)} />
          <SocialToggle settingKey="oauth_facebook_enabled" enabled={stored.oauth_facebook_enabled === "true"} label="Facebook" />
        </CardBody>
      </Card>
    </div>
  );
}
