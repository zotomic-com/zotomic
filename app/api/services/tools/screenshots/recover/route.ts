/**
 * POST /api/services/tools/screenshots/recover
 *
 * Body: { sessionId, itemId }
 * Runs link recovery on one screenshot (Link Recovery daily quota) and
 * returns the verified / probable / suggestion links found.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  resolveToolCaller,
  logUsage,
  countTodayUsage,
  toolRateLimit,
} from "@/lib/services/tools";
import { ScreenshotServiceError, recoverLinks, ownSession } from "@/lib/screenshots/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const res = await resolveToolCaller(req, "screenshot_organizer");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 401 });
  const caller = res.caller;
  const rate = await toolRateLimit(req, "screenshots_recover", caller.isAdmin);
  if (rate) return rate;

  let body: { sessionId?: string; itemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.sessionId || !body.itemId) {
    return NextResponse.json({ error: "sessionId and itemId are required." }, { status: 400 });
  }

  // link recovery has its own daily quota (admins unlimited)
  const recUsed = caller.isAdmin ? 0 : await countTodayUsage({
    service: "screenshot_organizer",
    action: "screenshot_recover",
    email: caller.email,
    tokenId: caller.tokenId,
    ip: caller.ip ?? undefined,
  });
  const recLimit = caller.isAdmin ? Number.POSITIVE_INFINITY : caller.limits.linkRecoveriesPerDay;
  if (Number.isFinite(recLimit) && recUsed >= recLimit) {
    return NextResponse.json(
      { error: `Daily link recovery limit reached (${recLimit}/day on the ${caller.plan} plan).`, used: recUsed, limit: recLimit },
      { status: 429 },
    );
  }

  try {
    await ownSession(body.sessionId, caller.email, caller.ip); // ownership check
    const { item, links } = await recoverLinks(body.sessionId, body.itemId);
    await logUsage({
      service: "screenshot_organizer",
      action: "screenshot_recover",
      user_email: caller.email,
      token_id: caller.tokenId,
      ip: caller.ip,
      ok: true,
    });
    return NextResponse.json({ item, links });
  } catch (e) {
    const status = e instanceof ScreenshotServiceError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Recovery failed.";
    await logUsage({
      service: "screenshot_organizer",
      action: "screenshot_recover",
      user_email: caller.email,
      token_id: caller.tokenId,
      ip: caller.ip,
      ok: false,
      reason: msg,
    });
    return NextResponse.json({ error: msg }, { status });
  }
}
