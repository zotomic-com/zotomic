import { getAdminSupabase } from "@/lib/supabase";

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
