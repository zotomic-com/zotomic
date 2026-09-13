import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { sendEmail, emailLayout, NOTIFICATION_EMAIL } from "@/lib/email";
import { renewDomain } from "@/lib/domains/dynadot";

export const maxDuration = 60;

/**
 * Daily domain-expiry sweep. Auto-renews from the admin's own Dynadot float
 * before the deadline regardless of customer payment status — the domain
 * should never actually lapse over a late payment — then emails a digest.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminSupabase();
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);

  const { data: orders } = await db
    .from("domain_orders")
    .select("id, domain_name, customer_name, expires_at, auto_renew")
    .eq("status", "active")
    .lte("expires_at", in30.toISOString().slice(0, 10));

  const renewed: string[] = [];
  const dueSoon: string[] = [];
  const failed: string[] = [];

  for (const o of orders ?? []) {
    const days = Math.ceil((new Date(o.expires_at as string).getTime() - Date.now()) / 86_400_000);
    // Auto-renew inside the last week of the window so it's never a same-day scramble.
    if (o.auto_renew && days <= 7) {
      const res = await renewDomain(o.domain_name as string);
      if ("error" in res) {
        failed.push(`${o.domain_name} — ${res.error}`);
      } else {
        const next = new Date(o.expires_at as string);
        next.setFullYear(next.getFullYear() + 1);
        await db.from("domain_orders").update({ expires_at: next.toISOString().slice(0, 10) }).eq("id", o.id);
        renewed.push(`${o.domain_name} (${o.customer_name})`);
      }
    } else {
      dueSoon.push(`${o.domain_name} — ${days}d left`);
    }
  }

  if (renewed.length || dueSoon.length || failed.length) {
    const section = (title: string, items: string[]) =>
      items.length ? `<p><b>${title}</b></p><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";
    await sendEmail({
      to: NOTIFICATION_EMAIL,
      subject: `Domain renewals — ${renewed.length} renewed, ${failed.length} failed`,
      html: emailLayout(
        section("Auto-renewed from the float", renewed) +
          section("Due within 30 days (not yet in the auto-renew window)", dueSoon) +
          (failed.length ? `<p style="color:#dc2626"><b>Failed — needs attention</b></p><ul>${failed.map((i) => `<li>${i}</li>`).join("")}</ul>` : ""),
      ),
    });
  }

  return NextResponse.json({ ok: true, renewed: renewed.length, dueSoon: dueSoon.length, failed: failed.length });
}
