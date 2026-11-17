/**
 * GET /api/services/tools/screenshots/me
 * Quota info for the UI: screenshots analyzed today + link recoveries today.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveToolCaller, countTodayUsage } from "@/lib/services/tools";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const res = await resolveToolCaller(req, "screenshot_organizer");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 401 });
  const caller = res.caller;
  const [shots, recs] = await Promise.all([
    countTodayUsage({
      service: "screenshot_organizer",
      action: "screenshot_analyze",
      email: caller.email,
      tokenId: caller.tokenId,
      ip: caller.ip ?? undefined,
    }),
    countTodayUsage({
      service: "screenshot_organizer",
      action: "screenshot_recover",
      email: caller.email,
      tokenId: caller.tokenId,
      ip: caller.ip ?? undefined,
    }),
  ]);
  return NextResponse.json({
    plan: caller.plan,
    screenshots: { used: shots, limit: caller.limits.screenshotsPerDay },
    recoveries: { used: recs, limit: caller.limits.linkRecoveriesPerDay },
  });
}
