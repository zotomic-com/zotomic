"use server";

import { getStoreBySlug } from "@/lib/storefront/store";
import { getAdminSupabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

export async function sendStoreEnquiry(
  slug: string,
  form: FormData,
): Promise<{ error: string } | { ok: true }> {
  const store = await getStoreBySlug(slug);
  if (!store) return { error: "Store unavailable" };

  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().slice(0, 200);
  const phone = String(form.get("phone") ?? "").trim().slice(0, 32);
  const message = String(form.get("message") ?? "").trim().slice(0, 3000);
  if (!name || !message || (!email && !phone)) {
    return { error: "Add your name, a message, and an email or phone." };
  }

  const db = getAdminSupabase();
  await db.from("contact_messages").insert({
    business_id: store.businessId,
    name,
    email: email || "no-email@storefront.local",
    phone: phone || null,
    business: store.name,
    topic: "storefront",
    message,
  });

  const { data: owner } = await db
    .from("business_members")
    .select("user_id, users(email)")
    .eq("business_id", store.businessId)
    .eq("role", "owner")
    .maybeSingle();
  const ownerEmail =
    ((Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { email?: string } | null)?.email ?? "";

  await db.from("notifications").insert({
    business_id: store.businessId,
    user_id: owner?.user_id ?? null,
    type: "enquiry",
    title: `New enquiry from ${name}`,
    body: message.slice(0, 140),
    href: "/app",
  });

  if (ownerEmail) {
    await sendEmail({
      to: ownerEmail,
      subject: `New enquiry on your store — ${name}`,
      replyTo: email || undefined,
      html: `<p><b>${name}</b> ${email ? `&lt;${email}&gt;` : ""} ${phone}</p><p>${message.replace(/\n/g, "<br>")}</p>`,
      text: `${name} ${email} ${phone}\n\n${message}`,
    }).catch(() => {});
  }

  return { ok: true };
}
