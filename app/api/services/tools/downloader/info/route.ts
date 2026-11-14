import { NextRequest, NextResponse } from "next/server";
import { resolveToolCaller, engineFetch, logUsage, toolRateLimit } from "@/lib/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { url } — resolve platform/title/thumbnail/qualities for a video link.
 * Proxy-only (no quota): the quota is consumed when a download actually
 * starts; this is burst rate-limited per IP.
 */
export async function POST(req: NextRequest) {
  const limited = toolRateLimit(req, "downloader_info");
  if (limited) return limited;

  const res = await resolveToolCaller(req, "downloader");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status });

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "Please paste a video link." }, { status: 400 });

  const engine = await engineFetch("/api/info", { method: "POST", body: { url } });
  const payload = await engine.json().catch(() => ({ error: "Could not resolve this link." }));
  if (!engine.ok) {
    await logUsage({
      service: "downloader",
      action: "info",
      user_email: res.caller.email,
      token_id: res.caller.tokenId,
      ok: false,
      reason: String((payload as { error?: string }).error ?? "engine_error").slice(0, 200),
      meta: { url },
    });
    return NextResponse.json(payload, { status: engine.status === 400 ? 400 : 502 });
  }
  return NextResponse.json(payload);
}
