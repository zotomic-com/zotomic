import { NextRequest, NextResponse } from "next/server";
import {
  RENDER_API_URL,
  resolveToolCaller,
  countTodayUsage,
  logUsage,
  signTicket,
  toolRateLimit,
} from "@/lib/services/tools";
import {
  ENGINE_UPLOAD_MAX_BYTES,
  SITE_SIDE_TYPES,
  SITE_UPLOAD_MAX_BYTES,
  getConvType,
  newConvertJobId,
  normalizeConvOptions,
  signConvertPayload,
} from "@/lib/services/converter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/converter — authorize one conversion.
 *
 * The browser sends only `{ slug, options }`. We resolve the caller, enforce the
 * daily converter quota and admin-editable access rules, then hand back either
 *   - an engine upload ticket (everything ffmpeg/img2pdf handles), or
 *   - `{ mode: "site" }` for Gemini-transcribed audio (posted to
 *     /api/converter/transcribe instead).
 *
 * The file itself never passes through Vercel: the browser uploads it straight
 * to the Render engine with the signed ticket, then polls progress and downloads
 * the result with a short-lived job ticket.
 */
export async function POST(req: NextRequest) {
  let body: { slug?: string; options?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim();
  if (!slug) return NextResponse.json({ error: "Choose a converter type." }, { status: 400 });

  const res = await resolveToolCaller(req, "converter");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 403 });
  const caller = res.caller;

  const limited = toolRateLimit(req, "converter", caller.isAdmin);
  if (limited) return limited;

  const type = await getConvType(slug);
  if (!type || !type.enabled) {
    return NextResponse.json({ error: "That converter is not available." }, { status: 404 });
  }

  let options: Record<string, string | number>;
  try {
    options = normalizeConvOptions(type, body.options);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  if (!caller.isAdmin) {
    const used = await countTodayUsage({
      service: "converter",
      action: "convert",
      email: caller.email,
      tokenId: caller.tokenId,
      ip: caller.ip,
    });
    const limit = caller.limits.converterPerDay;
    if (Number.isFinite(limit) && used >= limit) {
      return NextResponse.json(
        {
          error: `Daily limit reached — ${limit} conversions per day on the ${caller.plan} plan. Resets at midnight UTC.`,
        },
        { status: 429 },
      );
    }
  }

  const jobId = newConvertJobId();

  if (SITE_SIDE_TYPES.has(type.slug)) {
    await logUsage({
      service: "converter",
      action: "convert",
      user_email: caller.email,
      token_id: caller.tokenId,
      ip: caller.ip,
      ok: true,
      meta: { slug: type.slug, phase: "authorized", site: true, jobId },
    });
    return NextResponse.json({
      mode: "site",
      jobId,
      slug: type.slug,
      maxBytes: SITE_UPLOAD_MAX_BYTES,
    });
  }

  let ticket: string;
  try {
    ticket = signConvertPayload({ t: type.slug, o: options, n: ENGINE_UPLOAD_MAX_BYTES, j: jobId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }

  await logUsage({
    service: "converter",
    action: "convert",
    user_email: caller.email,
    token_id: caller.tokenId,
    ip: caller.ip,
    ok: true,
    meta: { slug: type.slug, phase: "authorized", jobId },
  });

  return NextResponse.json({
    mode: "engine",
    slug: type.slug,
    jobId,
    engineUrl: RENDER_API_URL,
    uploadUrl: `${RENDER_API_URL}/api/convert`,
    ticket,
    progressTicket: signTicket(jobId),
    maxBytes: ENGINE_UPLOAD_MAX_BYTES,
    options,
  });
}
