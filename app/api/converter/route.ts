/* API route: POST /api/converter
 * - Accepts: { type: ConvType, options?, files?: FormData } (multipart for file uploads)
 * - Returns: { jobId, status, result?, error }
 * - Quota‑gated, admin‑unlimited
 */

import { NextRequest, NextResponse } from "next/server";
import { engineFetch, logUsage, countTodayUsage as convCountTodayUsage, quotaStatus } from "@/lib/services/converter";
import { CONV_TYPE_INFO, type ConvType, type ConvCaller, resolveConvCaller, clampQuality } from "@/lib/services/converter";

/* ── per‑type validation & engine payload builder ───────────────────────── */

function buildEnginePayload(type: ConvType, opts: Record<string, unknown>, files: FileList | null): unknown {
  // Directly forward options + a "type" tag so the Render engine can dispatch
  return { type, options: opts, files: files ? Array.from(files) : [] };
}

function validateOpts(type: ConvType, opts: Record<string, unknown>): { ok: boolean; error?: string } {
  const info = CONV_TYPE_INFO[type];
  if (!info) return { ok: false, error: "Unknown converter type." };

  // required options per type
  switch (type) {
    case "pdf-to-images":
      if (!opts.format) return { ok: false, error: "Output format is required." };
      // type-safe access
      const dpiVal = opts.dpi;
      if (typeof dpiVal !== "number") return { ok: false, error: "DPI is required." };
      if (!Number.isInteger(dpiVal) || dpiVal < 72 || dpiVal > 600) return { ok: false, error: "DPI must be an integer between 72 and 600." };
      break;
    case "video-trim":
      if (!opts.start) return { ok: false, error: "Start time is required." };
      if (opts.duration && typeof opts.duration === "string" && !/^\d{2}:\d{2}:\d{2}$/.test(opts.duration))
        return { ok: false, error: "Duration must be HH:MM:SS format." };
      break;
    case "video-compress":
      if (Number(opts.crf) < 18 || Number(opts.crf) > 35) return { ok: false, error: "CRF must be between 18 and 35." };
      break;
    case "audio-compress":
      if (!opts.bitrate) return { ok: false, error: "Target bitrate is required." };
      break;
    default:
      // no extra validation for other types
  }
  return { ok: true };
}

/* ── POST handler ─────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  // Resolve caller for the converter type (from body, we'll get it after JSON parse)
  // We'll do a preliminary guest check first, then full resolution after knowing the type

  try {
    const body = await req.json();
    const type = body.type as ConvType | undefined;
    if (!type) {
      return NextResponse.json({ error: "Converter type is required." }, { status: 400 });
    }

    // Resolve caller for THIS converter type
    const callerRes = await resolveConvCaller(req, type);
    if (callerRes.error) return NextResponse.json({ error: callerRes.error }, { status: callerRes.status ?? 403 });

    const caller: ConvCaller = callerRes.caller!;

    // Quota check (admins unlimited)
    if (!caller.isAdmin) {
      const used = await convCountTodayUsage({
        service: type,
        action: "convert",
        email: caller.email,
        tokenId: caller.tokenId,
        ip: caller.ip,
      });
      const limit = caller.limits.converterPerDay;
      if (Number.isFinite(limit) && used >= limit) {
        return NextResponse.json(
          { error: `Daily limit reached (${limit} conversions/day on your plan). Resets at midnight UTC.` },
          { status: 429 },
        );
      }
    }

    // Validate options
    const optsBody = body.opts || {};
    const validation = validateOpts(type, optsBody as Record<string, unknown>);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Handle file uploads via multipart (the browser sends FormData)
    let files: FileList | null = null;
    let opts: Record<string, unknown> = {};

    // Check if this is a multipart/form-data request (file upload)
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const typeFromForm = formData.get("type") as string | null;
      const optsFromForm = Object.fromEntries(formData.entries()) as Record<string, unknown>;
      // Remove 'type' from opts
      delete optsFromForm.type;
      opts = optsFromForm;
      const uploadedFiles = formData.getAll("files");
      if (uploadedFiles.length) {
        // Create a fake FileList for compatibility
        const fakeFileList = {
          length: uploadedFiles.length,
          item: (i: number) => uploadedFiles[i] instanceof File ? uploadedFiles[i] : new File([uploadedFiles[i]], `file${i}.jpg`, { type: "image/jpeg" }),
        } as unknown as FileList;
        files = fakeFileList;
      }
    } else {
      // JSON body
      opts = optsBody;
    }

    // Build the engine payload
    const payload = buildEnginePayload(type, opts, files);

    // Call the engine
    const engineRes = await engineFetch("/api/convert", {
      method: "POST",
      body: payload,
    });

    if (!engineRes.ok) {
      const err = await engineRes.json().catch(() => ({ error: "Conversion failed" }));
      // Log the failure
      await logUsage({
        service: type,
        action: "convert",
        user_email: caller.email,
        token_id: caller.tokenId,
        ip: caller.ip,
        ok: false,
        reason: err.error || "Engine error",
      });
      return NextResponse.json({ error: err.error || "Conversion failed" }, { status: engineRes.status });
    }

    const data = await engineRes.json();

    // Log success
    await logUsage({
      service: type,
      action: "convert",
      user_email: caller.email,
      token_id: caller.tokenId,
      ip: caller.ip,
      ok: true,
      meta: { conversionType: type, hasResult: !!data.result },
    });

    // Return result — different shapes for different types
    if (type === "images-to-pdf" || type === "pdf-to-images") {
      // These return a blob or text depending on subtype
      return NextResponse.json(data);
    }

    // For video/audio conversions, the engine returns a jobId + status
    // and the browser polls /api/progress/:id
    return NextResponse.json({
      jobId: data.jobId || data.id,
      status: data.status || "pending",
      result: data.result,
    });
  } catch (e: any) {
    console.error("Converter API error:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}