import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { getEntitlements } from "@/lib/entitlements";
import { getOwnerPrefs } from "@/lib/notify";
import { PageHeader } from "@/components/app/PageHeader";
import { BusinessSettingsPanel, type BusinessSettings } from "./BusinessSettingsPanel";
import { ProfilePanel } from "./ProfilePanel";
import { SecurityPanel } from "./SecurityPanel";

export const dynamic = "force-dynamic";

const ALL_TABS = [
  { value: "business", label: "Business" },
  { value: "profile", label: "Profile" },
  { value: "security", label: "Security" },
  { value: "notifications", label: "Notifications" },
] as const;
type TabValue = (typeof ALL_TABS)[number]["value"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");

  const hasBusiness = !!tenant.businessId;
  const tabs = hasBusiness ? ALL_TABS : ALL_TABS.filter((t) => t.value === "profile" || t.value === "security");

  const { tab: rawTab } = await searchParams;
  const defaultTab: TabValue = hasBusiness ? "business" : "profile";
  const tab: TabValue = tabs.some((t) => t.value === rawTab) ? (rawTab as TabValue) : defaultTab;

  const db = getAdminSupabase();
  const [{ data: userRow }, businessData, ent, notifPrefs] = await Promise.all([
    db.from("users").select("name, email, phone, address, role, auth_provider").eq("id", tenant.user.id).single(),
    hasBusiness
      ? db
          .from("businesses")
          .select("name, type, currency, timezone, description, telegram_chat_id, logo_url, invoice_address, invoice_from_email, contact_email, contact_phone")
          .eq("id", tenant.businessId as string)
          .single()
      : Promise.resolve({ data: null }),
    hasBusiness ? getEntitlements(tenant.businessId as string) : Promise.resolve({ branded_invoice: false }),
    hasBusiness ? getOwnerPrefs(tenant.businessId as string) : Promise.resolve({}),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Business profile, your account, security, and notifications." />

      <div className="inline-flex gap-1 rounded-sm border border-border bg-surface-2 p-1">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`/app/settings?tab=${t.value}`}
            className={`rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors ${
              t.value === tab ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "business" && hasBusiness && (
        <BusinessSettingsPanel
          business={(businessData.data ?? {}) as BusinessSettings}
          brandedInvoice={ent.branded_invoice}
          notificationPrefs={notifPrefs}
          telegramLinked={!!businessData.data?.telegram_chat_id}
        />
      )}
      {tab === "profile" && (
        <ProfilePanel user={{ name: userRow?.name ?? "", email: userRow?.email ?? "", phone: userRow?.phone ?? "", address: userRow?.address ?? "" }} />
      )}
      {tab === "security" && (
        <SecurityPanel
          user={{ email: userRow?.email ?? "", phone: userRow?.phone ?? "", address: userRow?.address ?? "" }}
          hasPassword={userRow?.auth_provider === "password"}
        />
      )}
      {tab === "notifications" && hasBusiness && (
        <BusinessSettingsPanel
          business={(businessData.data ?? {}) as BusinessSettings}
          brandedInvoice={ent.branded_invoice}
          notificationPrefs={notifPrefs}
          telegramLinked={!!businessData.data?.telegram_chat_id}
          notificationsOnly
        />
      )}
    </div>
  );
}
