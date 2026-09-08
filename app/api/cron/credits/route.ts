import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * Friday credit reset. The heavy lifting (allowance_balance = plan_allowance +
 * repaid overdraft) is done in SQL by `app.reset_credit_allowances()` before
 * this is POSTed. Here we just drop a heads-up notification for each store.
 * `getCreditAccount()` also self-heals a missed reset on next read.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminSupabase();
  const { data: businesses } = await db.from("businesses").select("id").eq("status", "active");
  const rows = (businesses ?? []).map((b) => ({
    business_id: b.id as string,
    type: "credits_reset",
    title: "Weekly assistant credits reset",
    body: "Your assistant credits for the week are available. Unused credits from last week don't carry over.",
  }));
  if (rows.length) await db.from("notifications").insert(rows);

  return NextResponse.json({ notified: rows.length });
}
