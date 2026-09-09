import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { utcPeriod } from "@/lib/storefront/assistant";
import { pushAdminAlert } from "@/lib/admin/notify";

export const maxDuration = 60;

/** Daily platform digest → admin Telegram bots. Triggered by pg_cron. */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminSupabase();
  const d1 = new Date(Date.now() - 86_400_000).toISOString();
  const d7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: biz }, { data: newBiz }, { data: cp }, { data: sfp }, { data: o1 }, { data: failed }, { data: atCap }] =
    await Promise.all([
      db.from("businesses").select("id, status"),
      db.from("businesses").select("name, created_at").gte("created_at", d7),
      db.from("credit_purchases").select("id").eq("status", "submitted"),
      db.from("storefront_chat_purchases").select("id").eq("status", "submitted"),
      db.from("orders").select("total, status, placed_at").gte("placed_at", d1),
      db.from("reports").select("business_id").eq("status", "failed").gte("period_end", d7),
      db.from("storefront_assistant_usage").select("business_id").eq("period", utcPeriod()).gt("blocked", 0),
    ]);

  const rev1 = (o1 ?? []).filter((o) => o.status !== "cancelled").reduce((n, o) => n + Number(o.total), 0);
  const pendingPayments = (cp ?? []).length + (sfp ?? []).length;

  const lines = [
    `📊 <b>Zotomic — daily digest</b>`,
    `Stores: ${(biz ?? []).length} (${(biz ?? []).filter((b) => b.status === "active").length} active)`,
    `Yesterday: ${(o1 ?? []).length} orders, ${money(rev1, "BDT")}`,
  ];
  if ((newBiz ?? []).length) lines.push(`New stores (7d): ${(newBiz ?? []).map((b) => b.name).join(", ")}`);
  if (pendingPayments) lines.push(`⚠️ ${pendingPayments} payment${pendingPayments === 1 ? "" : "s"} awaiting your decision`);
  if ((failed ?? []).length) lines.push(`⚠️ ${(failed ?? []).length} weekly report${(failed ?? []).length === 1 ? "" : "s"} failed`);
  if ((atCap ?? []).length) lines.push(`⚠️ ${(atCap ?? []).length} storefront assistant${(atCap ?? []).length === 1 ? "" : "s"} turning shoppers away`);
  if (!pendingPayments && !(failed ?? []).length && !(atCap ?? []).length) lines.push(`Nothing needs attention. ✅`);

  await pushAdminAlert(lines.join("\n"));
  return NextResponse.json({ sent: true });
}
