import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { sendEmail, emailLayout } from "@/lib/email";
import { money } from "@/lib/money";

export const maxDuration = 120;

/**
 * Billing reminders. `app.billing_sweep()` (in Postgres) already generated
 * invoices + advanced lock states before calling this. Here we just email
 * owners: 3 days before due, on due date, mid-grace.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminSupabase();
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);

  const { data: invoices } = await db
    .from("invoices")
    .select(
      "id, business_id, invoice_number, amount, currency, due_date, payment_reference, txn_submitted_at, subscriptions(status, last_reminder_on, grace_started_on, id)",
    )
    .eq("status", "open");

  let sent = 0;
  for (const inv of invoices ?? []) {
    if (inv.txn_submitted_at) continue;
    const sub = (Array.isArray(inv.subscriptions) ? inv.subscriptions[0] : inv.subscriptions) as
      | { status?: string; last_reminder_on?: string; grace_started_on?: string; id?: string }
      | null;
    if (sub?.last_reminder_on === iso) continue;

    const due = inv.due_date ? new Date(inv.due_date + "T00:00:00Z") : null;
    if (!due) continue;
    const daysToDue = Math.round((due.getTime() - today.getTime()) / 86_400_000);

    let reason: string | null = null;
    if (daysToDue === 3) reason = "due in 3 days";
    else if (daysToDue === 0) reason = "due today";
    else if (sub?.status === "grace" && daysToDue <= -3 && daysToDue >= -5) reason = "overdue — grace period ending soon";
    if (!reason) continue;

    const { data: owner } = await db
      .from("business_members")
      .select("users(email), businesses(name)")
      .eq("business_id", inv.business_id)
      .eq("role", "owner")
      .maybeSingle();
    const email = ((Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { email?: string } | null)?.email;
    const bizName = ((Array.isArray(owner?.businesses) ? owner?.businesses[0] : owner?.businesses) as { name?: string } | null)?.name ?? "your business";
    if (!email) continue;

    await sendEmail({
      to: email,
      subject: `Invoice ${inv.invoice_number} — ${reason}`,
      html: emailLayout(`
        <p style="margin:0 0 12px">Your Zotomic subscription for <b>${bizName}</b> is ${reason}.</p>
        <p style="margin:0 0 4px">Amount: <b>${money(Number(inv.amount), (inv.currency as string) ?? "BDT")}</b></p>
        <p style="margin:0 0 12px;color:#94a3b8;font-size:13px">Reference: ${inv.payment_reference}</p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/app/billing" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600;font-size:14px">Pay by bKash →</a>
      `),
    });
    if (sub?.id) await db.from("subscriptions").update({ last_reminder_on: iso }).eq("id", sub.id);
    sent++;
  }

  return NextResponse.json({ remindersSent: sent });
}
