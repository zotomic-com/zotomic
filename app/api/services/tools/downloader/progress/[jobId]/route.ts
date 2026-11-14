import { NextRequest, NextResponse } from "next/server";
import { resolveToolCaller, engineFetch, verifyTicket } from "@/lib/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/services/tools/downloader/progress/:jobId?t=<ticket>
 * Server-side proxy for job progress. The signed ticket proves Zotomic issued
 * this job to the caller; the engine is called with the API key, so the
 * browser never needs direct access (and CORS never gets in the way).
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
  const res = await resolveToolCaller(req, "downloader");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status });

  const engine = await engineFetch(`/api/progress/${encodeURIComponent(jobId)}`);
  if (!engine.ok) {
    return NextResponse.json({ error: "Job not found." }, { status: engine.status === 404 ? 404 : 502 });
  }
  return NextResponse.json(await engine.json());
}
