import { getAdminSupabase } from "@/lib/supabase";

export type ServiceInquiryType = "hosting" | "custom_website" | "automation";

export interface UserServiceInquiry {
  service: string;
  message: string;
  status: string;
  createdAt: string;
}

/** A signed-in user's own Hosting/Custom Website/Automation requests — shared by the Front Desk and Hermes assistants. */
export async function getUserServiceInquiries(userId: string): Promise<UserServiceInquiry[]> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("service_inquiries")
    .select("service, message, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((r) => ({
    service: r.service as string,
    message: r.message as string,
    status: r.status as string,
    createdAt: r.created_at as string,
  }));
}

export interface CreateServiceInquiryInput {
  service: ServiceInquiryType;
  message: string;
  contactEmail: string | null;
  contactPhone: string | null;
  userId: string | null;
  businessId: string | null;
}

/** Shared writer — used by the public /web-development lead form and the Front Desk assistant's confirm_project_lead tool. */
export async function createServiceInquiry(input: CreateServiceInquiryInput): Promise<{ ok: true } | { error: string }> {
  const db = getAdminSupabase();
  const { error } = await db.from("service_inquiries").insert({
    user_id: input.userId,
    business_id: input.businessId,
    service: input.service,
    message: input.message.trim().slice(0, 2000),
    contact_phone: input.contactPhone?.trim().slice(0, 32) || null,
    contact_email: input.contactEmail?.trim().slice(0, 200) || null,
  });
  if (error) return { error: "Could not submit the request. Please try again." };
  return { ok: true };
}
