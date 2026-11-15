import { NextRequest, NextResponse } from "next/server";
import { resolveToolCaller, engineFetch, verifyTicket } from "@/lib/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/services/tools/video/progress/:jobId?t=<ticket>
 * Server-side proxy for video-generation job progress (same ticket scheme
 * as the downloader).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const ticket = req.nextUrl.searchParams.get("t") ?? "";
  if (!verifyTicket(jobId, ticket)) {
    return NextResponse.json({ error: "Invalid or expired ticket." }, { status: 403 });
  }
  const res = await resolveToolCaller(req, "video_generator");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status });

  let engine: Response;
  try {
    engine = await engineFetch(`/api/progress/${encodeURIComponent(jobId)}`, { timeoutMs: 15_000 });
  } catch {
    return NextResponse.json({ error: "Progress service is unavailable right now." }, { status: 502 });
  }
  if (!engine.ok) {
    return NextResponse.json({ error: "Job not found." }, { status: engine.status === 404 ? 404 : 502 });
  }
  return NextResponse.json(await engine.json());
}
