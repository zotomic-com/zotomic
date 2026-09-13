"use server";

import { requireUser } from "@/lib/app-actions";
import { notifyAdmins } from "@/lib/notify";

export type ServiceType = "hosting" | "custom_website" | "automation";

const SERVICE_LABELS: Record<ServiceType, string> = {
  hosting: "Hosting",
  custom_website: "Custom Website",
  automation: "Automation",
};

export async function submitServiceInquiryAction(
  service: ServiceType,
  input: { message: string; contactPhone?: string; contactEmail?: string },
): Promise<{ ok: true } | { error: string }> {
  const { user, businessId, db } = await requireUser();
  if (!input.message.trim()) return { error: "Please describe what you're looking for." };

  const { error } = await db.from("service_inquiries").insert({
    user_id: user.id,
    business_id: businessId,
    service,
    message: input.message.trim().slice(0, 2000),
    contact_phone: input.contactPhone?.trim().slice(0, 32) || null,
    contact_email: input.contactEmail?.trim().slice(0, 200) || user.email,
  });
  if (error) return { error: "Could not submit your request. Please try again." };

  await notifyAdmins("service_inquiry", {
    title: `${SERVICE_LABELS[service]} inquiry — ${user.name}`,
    body: input.message.trim().slice(0, 300),
    href: "/admin/users",
    businessId: businessId ?? undefined,
  });

  return { ok: true };
}
