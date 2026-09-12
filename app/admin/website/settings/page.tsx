import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformSettings, PLATFORM_KEYS, PLATFORM_KEY_GROUPS } from "@/lib/platform-settings";
import { getAdminPrefs } from "@/lib/notify";
import { SettingsFieldsForm } from "../SettingsFieldsForm";
import { AdminNotifications } from "./AdminNotifications";

export const dynamic = "force-dynamic";

function fieldsFor(keys: readonly (keyof typeof PLATFORM_KEYS)[], stored: Record<string, string>) {
  return keys.map((key) => ({
    key,
    label: PLATFORM_KEYS[key].label,
    secret: PLATFORM_KEYS[key].secret,
    value: PLATFORM_KEYS[key].secret ? (stored[key] ? "••••••••" : "") : (stored[key] ?? ""),
  }));
}

export default async function AdminWebsiteSettingsPage() {
  const admin = await requireAdmin();
  const [stored, notifPrefs] = await Promise.all([getPlatformSettings(), getAdminPrefs(admin.id)]);

  return (
    <div className="space-y-5">
      <PageHeader title="General settings" subtitle="Telegram bot, manual-billing payment numbers, the invoice sender address, and automation gateways." />

      <Card>
        <CardHeader>
          <CardTitle>Telegram bot</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            Create a bot with @BotFather, paste the token here. Store owners set their chat ID in Settings, then the
            assistant can deliver reports to Telegram.
          </p>
          <SettingsFieldsForm fields={fieldsFor(["telegram_bot_token"], stored)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments & invoicing</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            Your personal bKash/Nagad numbers, shown to owners for subscription payments and credit top-ups, plus the
            From address on invoices for free-plan stores.
          </p>
          <SettingsFieldsForm fields={fieldsFor(["payment_bkash_number", "payment_nagad_number", "invoice_from_email"], stored)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automation / agent gateway</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">Hermes and n8n — entered here, wired to live calls elsewhere.</p>
          <SettingsFieldsForm fields={fieldsFor(PLATFORM_KEY_GROUPS.integrations, stored)} />
        </CardBody>
      </Card>

      <AdminNotifications prefs={notifPrefs} />
    </div>
  );
}
