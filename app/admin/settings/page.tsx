import { requireAdmin } from "@/lib/admin-server";
import { getPlatformSettings, PLATFORM_KEYS, PLATFORM_KEY_GROUPS } from "@/lib/platform-settings";
import { PageHeader } from "@/components/app/PageHeader";
import { PlatformSettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const stored = await getPlatformSettings();

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
        subtitle="Telegram bot for report delivery, and tracking for zotomic.com."
      />
      <PlatformSettingsForm fields={fields} />
    </div>
  );
}
