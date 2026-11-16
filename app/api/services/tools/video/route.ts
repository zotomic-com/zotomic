import { NextRequest, NextResponse } from "next/server";
import {
  resolveToolCaller,
  engineFetch,
  logUsage,
  toolRateLimit,
  countTodayUsage,
  signTicket,
  RENDER_API_URL,
} from "@/lib/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { text, voice, style } — generate a narrated vertical video.
 * The engine does voice (edge-tts, word timings) + render (ffmpeg, animated
 * background + karaoke captions). Progress is polled through Zotomic; the
 * finished file downloads straight from the engine via a signed ticket.
 */
export async function POST(req: NextRequest) {
  const limited = toolRateLimit(req, "video_start");
  if (limited) return limited;

  const res = await resolveToolCaller(req, "video_generator");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status });
  const caller = res.caller;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  let body: { text?: string; voice?: string; style?: string; character?: string; audioStyle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  const voice = (body.voice ?? "en-US-GuyNeural").slice(0, 50);
  const style = (body.style ?? "ocean").slice(0, 20);
  const character = (body.character ?? "").trim().slice(0, 24);
  const audioStyle = (body.audioStyle ?? "").trim().slice(0, 12);
  if (text.length < 10) return NextResponse.json({ error: "Please write at least a sentence (10+ characters)." }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ error: "Script is too long (5000 characters max — about 60–90 seconds of video)." }, { status: 400 });
  if (character && !/^[a-z0-9_-]+$/.test(character)) return NextResponse.json({ error: "Unknown character." }, { status: 400 });
  if (audioStyle && !/^[a-z]{1,12}$/.test(audioStyle)) return NextResponse.json({ error: "Unknown audio style." }, { status: 400 });

  // Daily quota (admins unlimited).
  if (!caller.isAdmin) {
    const used = await countTodayUsage({ service: "video_generator", action: "video", email: caller.email, tokenId: caller.tokenId, ip: caller.ip });
    if (used >= caller.limits.videoPerDay) {
      await logUsage({ service: "video_generator", action: "video", user_email: caller.email, token_id: caller.tokenId, ip, ok: false, reason: "daily_limit", meta: { chars: text.length } });
      return NextResponse.json(
        { error: `Daily limit reached (${caller.limits.videoPerDay} videos/day on your plan). Resets at midnight UTC.` },
        { status: 429 },
      );
    }
  }

  let engine: Response;
  try {
    engine = await engineFetch("/api/video", { method: "POST", body: { text, voice, style, character, audioStyle }, timeoutMs: 30_000 });
  } catch {
    return NextResponse.json({ error: "The video studio is warming up. Please try again in a moment." }, { status: 502 });
  }
  const payload = (await engine.json().catch(() => null)) as { jobId?: string; error?: string } | null;

  if (!engine.ok || !payload?.jobId) {
    const message = payload?.error ?? "The video studio is busy or unavailable. Please try again shortly.";
    await logUsage({
      service: "video_generator",
      action: "video",
      user_email: caller.email,
      token_id: caller.tokenId,
      ip,
      ok: false,
      reason: message.slice(0, 200),
      meta: { chars: text.length, voice, style },
    });
    return NextResponse.json({ error: message }, { status: engine.status === 429 ? 429 : 502 });
  }

  await logUsage({
    service: "video_generator",
    action: "video",
    user_email: caller.email,
    token_id: caller.tokenId,
    ip,
    ok: true,
    meta: { chars: text.length, voice, style, character: character || undefined, audioStyle: audioStyle || undefined, jobId: payload.jobId },
  });

  const ticket = signTicket(payload.jobId, 24 * 60 * 60 * 1000); // file stays downloadable for 24h
  return NextResponse.json({
    jobId: payload.jobId,
    progressUrl: `/api/services/tools/video/progress/${payload.jobId}?t=${encodeURIComponent(ticket)}`,
    fileUrl: `${RENDER_API_URL}/api/file/${payload.jobId}?t=${encodeURIComponent(ticket)}`,
  });
}
