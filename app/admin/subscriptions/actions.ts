"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { confirmInvoice } from "@/lib/billing";
import { getAdminSupabase } from "@/lib/supabase";
import { sendEmail, emailLayout } from "@/lib/email";

export async function confirmPayment(invoiceId: string) {
  const admin = await requireAdmin();
  const res = await confirmInvoice(invoiceId, admin.id);
  if ("error" in res) return res;

  // notify the owner their account is back
  try {
    const db = getAdminSupabase();
    const { data: inv } = await db
      .from("invoices")
      .select("business_id, invoice_number")
      .eq("id", invoiceId)
      .single();
    if (inv) {
      const { data: owner } = await db
        .from("business_members")
        .select("users(email), businesses(name)")
        .eq("business_id", inv.business_id)
        .eq("role", "owner")
        .maybeSingle();
      const email = ((Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { email?: string } | null)?.email;
      const name = ((Array.isArray(owner?.businesses) ? owner?.businesses[0] : owner?.businesses) as { name?: string } | null)?.name ?? "your business";
      if (email) {
        await sendEmail({
          to: email,
          subject: `Payment confirmed — ${name} is active`,
          html: emailLayout(
            `<p style="margin:0 0 12px">We've confirmed your payment for invoice <b>${inv.invoice_number}</b>. Your subscription is active again and everything is back online.</p>
             <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/app" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600;font-size:14px">Open Zotomic →</a>`,
          ),
        });
      }
    }
  } catch (e) {
    console.error("confirm email failed", (e as Error).message);
  }

  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin");
  return { ok: true };
}

export async function voidInvoice(invoiceId: string) {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  await db.from("invoices").update({ status: "void" }).eq("id", invoiceId);
  await db.from("audit_logs").insert({
    actor_id: admin.id,
    actor_type: "admin",
    action: "invoice.voided",
    target_type: "invoice",
    target_id: invoiceId,
  });
  revalidatePath("/admin/subscriptions");
  return { ok: true };
}
