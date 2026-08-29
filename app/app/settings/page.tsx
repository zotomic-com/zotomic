import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/app/PageHeader";
import { SettingsClient, type BusinessSettings } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const db = getAdminSupabase();
  const { data } = await db
    .from("businesses")
    .select("name, type, currency, timezone, description, telegram_chat_id, logo_url, invoice_address, contact_email, contact_phone")
    .eq("id", tenant.businessId)
    .single();

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Business profile and your account." />
      <SettingsClient business={(data ?? {}) as BusinessSettings} user={tenant.user} />
    </div>
  );
}
