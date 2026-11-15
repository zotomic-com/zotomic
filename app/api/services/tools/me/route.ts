import { NextRequest, NextResponse } from "next/server";
import { resolveToolCaller, quotaStatus } from "@/lib/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — the caller's current access + remaining quota for both tools.
 * Powers the "what's left today" panel on the service pages.
 */
export async function GET(req: NextRequest) {
  const res = await resolveToolCaller(req, "downloader");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status });

  const downloader = await quotaStatus(res.caller, "downloader");
  // Second resolution against the other services so per-service access rows apply.
  const res2 = await resolveToolCaller(req, "text_to_audio");
  const res3 = await resolveToolCaller(req, "video_generator");
  const tts = res2.caller
    ? await quotaStatus(res2.caller, "text_to_audio")
    : { service: "text_to_audio", error: res2.error ?? "No access" };
  const video = res3.caller
    ? await quotaStatus(res3.caller, "video_generator")
    : { service: "video_generator", error: res3.error ?? "No access" };

  return NextResponse.json({ email: res.caller.email, downloader, tts, video });
}
