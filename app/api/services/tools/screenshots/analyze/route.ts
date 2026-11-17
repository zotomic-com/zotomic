/**
 * POST /api/services/tools/screenshots/analyze
 *
 * Body: {
 *   sessionId?: string,           // omit → a new session is created
 *   consent: true,                // the ToS checkbox must be true
 *   items: [{
 *     name: string,               // editable display name
 *     dataUrl: string,            // downscaled JPEG dataURL (analysis copy only)
 *     thumb?: string,             // tiny dataURL kept for the grid
 *     group?: string,             // group name (created if missing)
 *     details?: string,           // user's "why" note
 *     link?: string               // user-provided link, if any
 *   }]
 * }
 *
 * Quotas: each analyzed image = 1 screenshot against the plan's daily limit
 * (service_usage rows since UTC midnight, same as the other tools).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  resolveToolCaller,
  logUsage,
  countTodayUsage,
  toolRateLimit,
} from "@/lib/services/tools";
import {
  ScreenshotServiceError,
  createSession,
  ensureGroup,
  addItem,
  listItems,
} from "@/lib/screenshots/service";

export const runtime = "nodejs";
export const maxDuration = 60;

interface IncomingItem {
  name?: string;
  dataUrl?: string;
  thumb?: string;
  group?: string;
  details?: string;
  link?: string;
}

function parseDataUrl(dataUrl: string): { base64: string; mime: string } | null {
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
}

export async function POST(req: NextRequest) {
  const rate = await toolRateLimit(req, "screenshots_analyze");
  if (rate) return rate;

  const res = await resolveToolCaller(req, "screenshot_organizer");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 401 });
  const caller = res.caller;

  let body: { sessionId?: string; consent?: boolean; items?: IncomingItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: "You must accept the access terms first." }, { status: 400 });
  }
  const incoming = (body.items ?? []).slice(0, 4); // small batches — Vercel body limit
  if (!incoming.length || !incoming.every((i) => i.dataUrl)) {
    return NextResponse.json({ error: "No screenshots to analyze." }, { status: 400 });
  }

  // per-day screenshot quota
  const used = await countTodayUsage({
    service: "screenshot_organizer",
    action: "screenshot_analyze",
    email: caller.email,
    tokenId: caller.tokenId,
    ip: caller.ip ?? undefined,
  });
  const limit = caller.limits.screenshotsPerDay;
  if (Number.isFinite(limit) && used + incoming.length > limit) {
    await logUsage({
      service: "screenshot_organizer",
      action: "screenshot_analyze",
      user_email: caller.email,
      token_id: caller.tokenId,
      ip: caller.ip,
      ok: false,
      reason: "quota",
    });
    return NextResponse.json(
      { error: `Daily screenshot limit reached (${limit}/day on the ${caller.plan} plan). Come back tomorrow or upgrade.`, used, limit },
      { status: 429 },
    );
  }

  try {
    const session = body.sessionId
      ? // ownership is checked by ensure/add operations below
        ({ id: body.sessionId } as { id: string })
      : await createSession(caller.email, caller.ip);

    const results = [];
    for (const it of incoming) {
      const parsed = parseDataUrl(it.dataUrl ?? "");
      if (!parsed) {
        results.push({ name: it.name ?? "Screenshot", error: "Unsupported image data." });
        continue;
      }
      const group = it.group ? await ensureGroup(session.id, it.group) : null;
      try {
        const item = await addItem(caller.email, caller.ip, {
          sessionId: session.id,
          name: it.name ?? "Screenshot",
          groupId: group?.id ?? null,
          details: it.details,
          userLink: it.link,
          thumb: it.thumb,
          imageBase64: parsed.base64,
          mimeType: parsed.mime,
        });
        await logUsage({
          service: "screenshot_organizer",
          action: "screenshot_analyze",
          user_email: caller.email,
          token_id: caller.tokenId,
          ip: caller.ip,
          ok: true,
        });
        results.push({ ok: true, item });
      } catch (e) {
        const msg = e instanceof ScreenshotServiceError ? e.message : "Analysis failed.";
        await logUsage({
          service: "screenshot_organizer",
          action: "screenshot_analyze",
          user_email: caller.email,
          token_id: caller.tokenId,
          ip: caller.ip,
          ok: false,
          reason: msg,
        });
        results.push({ name: it.name ?? "Screenshot", error: msg });
      }
    }

    const items = await listItems(session.id);
    return NextResponse.json({
      sessionId: session.id,
      items,
      failed: results.filter((r) => "error" in r),
    });
  } catch (e) {
    const status = e instanceof ScreenshotServiceError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    return NextResponse.json({ error: msg }, { status });
  }
}
