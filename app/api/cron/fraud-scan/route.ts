import { NextRequest, NextResponse } from "next/server";
import { runFraudScan } from "@/lib/fraud/detect";

export const maxDuration = 300;

/** Daily platform-wide fraud scan → refreshes Stage-1/2 auto flags. pg_cron. */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = await runFraudScan();
  return NextResponse.json(res);
}
