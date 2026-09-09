import { requireAdmin } from "@/lib/admin-server";
import { getPlatformSettings, PLATFORM_KEYS, PLATFORM_KEY_GROUPS } from "@/lib/platform-settings";
import { getAdminPrefs } from "@/lib/notify";
import { PageHeader } from "@/components/app/PageHeader";
import { PlatformSettingsForm } from "./SettingsForm";
import { AdminNotifications } from "./AdminNotifications";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const admin = await requireAdmin();
  const [stored, notifPrefs] = await Promise.all([getPlatformSettings(), getAdminPrefs(admin.id)]);

  const fields = PLATFORM_KEY_GROUPS.settings.map((key) => ({
    key,
    label: PLATFORM_KEYS[key].label,
    secret: PLATFORM_KEYS[key].secret,
    // mask secrets, show plain values
    value: PLATFORM_KEYS[key].secret ? (stored[key] ? "••••••••" : "") : (stored[key] ?? ""),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Platform Settings"
        subtitle="Telegram bot, zotomic.com tracking, your bKash/Nagad numbers for payments, and the invoice sender address."
      />
      <PlatformSettingsForm fields={fields} />
      <AdminNotifications prefs={notifPrefs} />
    </div>
  );
}
