import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { generateReport } from "@/lib/reports/generate";

export const maxDuration = 300;

/**
 * Scheduled weekly-report generation. Triggered by Supabase pg_cron (which POSTs
 * here with the shared secret). Also callable manually with the same header.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminSupabase();

  // Active businesses whose subscription isn't hard-locked.
  const { data: businesses } = await db
    .from("businesses")
    .select("id, name, subscriptions(status)")
    .eq("status", "active");

  const due = (businesses ?? []).filter((b) => {
    const sub = Array.isArray(b.subscriptions) ? b.subscriptions[0] : b.subscriptions;
    return (sub as { status?: string } | null)?.status !== "hard_lock";
  });

  const results: { business: string; status: string; model: string | null }[] = [];
  for (const b of due) {
    const r = await generateReport(b.id as string).catch((e) => ({
      status: "failed" as const,
      aiModel: null,
      reportId: "",
      error: (e as Error).message,
    }));
    results.push({ business: b.name as string, status: r.status, model: r.aiModel });
  }

  return NextResponse.json({ generated: results.length, results });
}
