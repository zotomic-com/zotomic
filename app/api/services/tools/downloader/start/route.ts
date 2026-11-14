import { NextRequest, NextResponse } from "next/server";
import {
  resolveToolCaller,
  engineFetch,
  logUsage,
  toolRateLimit,
  countTodayUsage,
  clampQuality,
  signTicket,
  RENDER_API_URL,
} from "@/lib/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { url, mode: "video"|"audio", qualityId } — start a download job.
 * Enforces the caller's daily quota + max quality, proxies to the engine,
 * and returns { jobId, progressUrl, fileUrl } where the two URLs go straight
 * to the engine with a short-lived signed ticket (?t=…), so large files never
 * stream through Zotomic.
 */
export async function POST(req: NextRequest) {
  const limited = toolRateLimit(req, "downloader_start");
  if (limited) return limited;

  const res = await resolveToolCaller(req, "downloader");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status });
  const caller = res.caller;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  let body: { url?: string; mode?: string; qualityId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  const mode = body.mode === "audio" ? "audio" : "video";
  if (!url) return NextResponse.json({ error: "Please paste a video link." }, { status: 400 });

  // Daily quota (admins unlimited).
  if (!caller.isAdmin) {
    const used = await countTodayUsage({ service: "downloader", action: "download_start", email: caller.email, tokenId: caller.tokenId, ip: caller.ip });
    if (used >= caller.limits.downloaderPerDay) {
      await logUsage({ service: "downloader", action: "download_start", user_email: caller.email, token_id: caller.tokenId, ip, ok: false, reason: "daily_limit", meta: { url, mode } });
      return NextResponse.json(
        { error: `Daily limit reached (${caller.limits.downloaderPerDay} downloads/day on your plan). Resets at midnight UTC.` },
        { status: 429 },
      );
    }
  }

  const qualityId = clampQuality(body.qualityId, mode === "video" ? caller.limits.downloaderMaxQuality : null);
  const engine = await engineFetch("/api/download", { method: "POST", body: { url, mode, qualityId } });
  const payload = (await engine.json().catch(() => null)) as { jobId?: string; error?: string } | null;

  if (!engine.ok || !payload?.jobId) {
    const message = payload?.error ?? "The download service is busy or unavailable. Please try again shortly.";
    await logUsage({
      service: "downloader",
      action: "download_start",
      user_email: caller.email,
      token_id: caller.tokenId,
      ip,
      ok: false,
      reason: message.slice(0, 200),
      meta: { url, mode, qualityId },
    });
    return NextResponse.json({ error: message }, { status: engine.status === 429 ? 429 : 502 });
  }

  await logUsage({
    service: "downloader",
    action: "download_start",
    user_email: caller.email,
    token_id: caller.tokenId,
    ip,
    ok: true,
    meta: { url, mode, qualityId, jobId: payload.jobId },
  });

  const ticket = signTicket(payload.jobId);
  return NextResponse.json({
    jobId: payload.jobId,
    // progress is proxied through Zotomic (tiny JSON, no CORS dependency);
    // the file itself downloads straight from the engine via a signed ticket
    progressUrl: `/api/services/tools/downloader/progress/${payload.jobId}?t=${encodeURIComponent(ticket)}`,
    fileUrl: `${RENDER_API_URL}/api/file/${payload.jobId}?t=${encodeURIComponent(ticket)}`,
  });
}
