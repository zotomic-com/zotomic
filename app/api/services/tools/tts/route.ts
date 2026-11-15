import { NextRequest, NextResponse } from "next/server";
import {
  resolveToolCaller,
  engineFetch,
  logUsage,
  toolRateLimit,
  countTodayUsage,
} from "@/lib/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — voice catalogue from the engine (session or service token). */
export async function GET(req: NextRequest) {
  const limited = toolRateLimit(req, "tts_voices");
  if (limited) return limited;

  const res = await resolveToolCaller(req, "text_to_audio");
  if (!res.caller) {
    await logUsage({
      service: "text_to_audio",
      action: "voices",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
      ok: false,
      reason: res.error,
    });
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  const engine = await engineFetch("/api/tts/voices", { timeoutMs: 30_000 });
  if (!engine.ok) {
    return NextResponse.json({ error: "Voice service is unavailable right now." }, { status: 502 });
  }
  return NextResponse.json(await engine.json());
}

/** POST — text → mp3. Counts against the caller's daily TTS quota. */
export async function POST(req: NextRequest) {
  const limited = toolRateLimit(req, "tts");
  if (limited) return limited;

  const res = await resolveToolCaller(req, "text_to_audio");
  if (!res.caller) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }
  const caller = res.caller;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  let body: { text?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  const voice = (body.voice ?? "en-US-GuyNeural").slice(0, 100);
  if (!text) return NextResponse.json({ error: "Please enter some text." }, { status: 400 });
  if (text.length > 3000) {
    return NextResponse.json({ error: "Text is too long (3000 characters max)." }, { status: 400 });
  }

  // Quota (admins unlimited).
  if (!caller.isAdmin) {
    const used = await countTodayUsage({ service: "text_to_audio", action: "tts", email: caller.email, tokenId: caller.tokenId, ip: caller.ip });
    if (used >= caller.limits.ttsPerDay) {
      await logUsage({ service: "text_to_audio", action: "tts", user_email: caller.email, token_id: caller.tokenId, ip, ok: false, reason: "daily_limit", meta: { used } });
      return NextResponse.json(
        { error: `Daily limit reached (${caller.limits.ttsPerDay} generations/day on your plan). Resets at midnight UTC.` },
        { status: 429 },
      );
    }
  }

  let engine: Response;
  try {
    engine = await engineFetch("/api/tts", { method: "POST", body: { text, voice }, timeoutMs: 50_000 });
  } catch {
    return NextResponse.json(
      { error: "Audio generation took too long. Please try again — shorter text is faster." },
      { status: 502 },
    );
  }
  if (!engine.ok || !engine.body) {
    const detail = await engine.text().catch(() => "");
    let message = "Audio generation failed. Please try again.";
    try {
      message = JSON.parse(detail).error ?? message;
    } catch {}
    await logUsage({ service: "text_to_audio", action: "tts", user_email: caller.email, token_id: caller.tokenId, ip, ok: false, reason: detail.slice(0, 200), meta: { voice, chars: text.length } });
    return NextResponse.json({ error: message }, { status: engine.status === 429 ? 429 : 502 });
  }

  await logUsage({
    service: "text_to_audio",
    action: "tts",
    user_email: caller.email,
    token_id: caller.tokenId,
    ip,
    ok: true,
    meta: { voice, chars: text.length },
  });

  return new NextResponse(engine.body, {
    status: 200,
    headers: {
      "Content-Type": engine.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
