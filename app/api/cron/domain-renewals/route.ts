import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { sendEmail, emailLayout, NOTIFICATION_EMAIL } from "@/lib/email";
import { renewDomain, getTransferStatus } from "@/lib/domains/dynadot";
import { getDomainSettings } from "@/lib/platform-settings";

export const maxDuration = 60;

/**
 * Daily domain lifecycle sweep: auto-renews from the admin's own Dynadot
 * float ahead of the deadline regardless of customer payment status (a
 * domain should never actually lapse over a late payment), ages expired
 * domains through a generic grace window into "dropped", polls in-flight
 * transfers for completion, then emails a digest.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminSupabase();
  const settings = await getDomainSettings();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);

  const renewed: string[] = [];
  const dueSoon: string[] = [];
  const failed: string[] = [];
  const graced: string[] = [];
  const dropped: string[] = [];
  const transferred: string[] = [];

  // 1. Active domains nearing/at expiry: auto-renew within 7 days, else move past-due ones to grace.
  const { data: activeItems } = await db
    .from("domain_cart_items")
    .select("id, domain_name, expires_at, auto_renew, renewal_count")
    .eq("status", "active")
    .lte("expires_at", in30.toISOString().slice(0, 10));

  for (const item of activeItems ?? []) {
    const days = Math.ceil((new Date(item.expires_at as string).getTime() - Date.now()) / 86_400_000);
    if (item.auto_renew && days <= 7 && days >= 0) {
      const res = await renewDomain(item.domain_name as string);
      if ("error" in res) {
        failed.push(`${item.domain_name} — ${res.error}`);
      } else {
        const next = new Date(item.expires_at as string);
        next.setFullYear(next.getFullYear() + 1);
        await db
          .from("domain_cart_items")
          .update({ expires_at: next.toISOString().slice(0, 10), renewal_count: ((item.renewal_count as number) ?? 0) + 1 })
          .eq("id", item.id);
        renewed.push(item.domain_name as string);
      }
    } else if (days < 0) {
      await db.from("domain_cart_items").update({ status: "grace" }).eq("id", item.id);
      graced.push(item.domain_name as string);
    } else {
      dueSoon.push(`${item.domain_name} — ${days}d left`);
    }
  }

  // 2. Grace-period domains past the admin-configured window: drop them.
  const { data: graceItems } = await db.from("domain_cart_items").select("id, domain_name, expires_at").eq("status", "grace");
  for (const item of graceItems ?? []) {
    const graceEnds = new Date(item.expires_at as string);
    graceEnds.setDate(graceEnds.getDate() + settings.graceDays);
    if (graceEnds.toISOString().slice(0, 10) <= today) {
      await db.from("domain_cart_items").update({ status: "dropped" }).eq("id", item.id);
      dropped.push(item.domain_name as string);
    }
  }

  // 3. In-flight transfers: poll Dynadot for completion.
  const { data: transferring } = await db.from("domain_cart_items").select("id, domain_name").eq("status", "transferring");
  for (const item of transferring ?? []) {
    const res = await getTransferStatus(item.domain_name as string);
    if (res.status === "completed") {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      await db
        .from("domain_cart_items")
        .update({ status: "active", registered_at: new Date().toISOString(), expires_at: expiresAt.toISOString().slice(0, 10) })
        .eq("id", item.id);
      transferred.push(item.domain_name as string);
    } else if (res.status === "failed") {
      await db.from("domain_cart_items").update({ status: "failed", last_error: res.error ?? "Transfer failed." }).eq("id", item.id);
      failed.push(`${item.domain_name} (transfer) — ${res.error ?? "failed"}`);
    }
  }

  const totalEvents = renewed.length + dueSoon.length + failed.length + graced.length + dropped.length + transferred.length;
  if (totalEvents) {
    const section = (title: string, items: string[]) =>
      items.length ? `<p><b>${title}</b></p><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";
    await sendEmail({
      to: NOTIFICATION_EMAIL,
      subject: `Domain renewals — ${renewed.length} renewed, ${dropped.length} dropped, ${failed.length} failed`,
      html: emailLayout(
        section("Auto-renewed from the float", renewed) +
          section("Transfers completed", transferred) +
          section("Due within 30 days (not yet in the auto-renew window)", dueSoon) +
          section("Entered grace period (expired, not auto-renewed)", graced) +
          section("Dropped (grace period elapsed)", dropped) +
          (failed.length ? `<p style="color:#dc2626"><b>Failed — needs attention</b></p><ul>${failed.map((i) => `<li>${i}</li>`).join("")}</ul>` : ""),
      ),
    });
  }

  return NextResponse.json({
    ok: true,
    renewed: renewed.length,
    dueSoon: dueSoon.length,
    failed: failed.length,
    graced: graced.length,
    dropped: dropped.length,
    transferred: transferred.length,
  });
}
