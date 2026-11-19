import { NextRequest, NextResponse } from "next/server";
import { engineFetch, resolveToolCaller, toolRateLimit } from "@/lib/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/converter/tts — Text → Audio inside the Converter.
 *
 * The quota was already charged by /api/converter; this streams the mp3 back
 * from the engine's edge-tts endpoint. Voice, rate and volume come from the
 * admin-defined options.
 */
export async function POST(req: NextRequest) {
  const res = await resolveToolCaller(req, "converter");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 403 });
  const caller = res.caller;

  const limited = toolRateLimit(req, "converter_tts", caller.isAdmin);
  if (limited) return limited;

  let body: { text?: string; voice?: string; rate?: string; volume?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = String(body.text ?? "").trim();
  const voice = String(body.voice ?? "en-US-GuyNeural").slice(0, 100);
  const rate = String(body.rate ?? "0%");
  const volume = String(body.volume ?? "0%");

  if (!text) return NextResponse.json({ error: "Enter some text to speak." }, { status: 400 });
  const maxChars = caller.isAdmin ? 12_000 : 3_000;
  if (text.length > maxChars) {
    return NextResponse.json({ error: `Text is too long (${maxChars} characters max).` }, { status: 400 });
  }
  if (!/^[A-Za-z][A-Za-z-]{1,40}$/.test(voice)) {
    return NextResponse.json({ error: "Choose a valid voice." }, { status: 400 });
  }

  let engine: Response;
  try {
    engine = await engineFetch("/api/tts", {
      method: "POST",
      body: {
        text,
        voice,
        rate,
        volume,
        ...(caller.isAdmin ? { maxLen: 1 } : {}),
      },
      timeoutMs: 55_000,
    });
  } catch {
    return NextResponse.json(
      { error: "Speech generation took too long. Try shorter text — it is faster." },
      { status: 502 },
    );
  }

  if (!engine.ok || !engine.body) {
    const detail = await engine.text().catch(() => "");
    let message = "Speech generation failed. Please try again.";
    try {
      message = JSON.parse(detail).error ?? message;
    } catch {}
    return NextResponse.json({ error: message }, { status: engine.status === 429 ? 429 : 502 });
  }

  return new NextResponse(engine.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="speech-${voice}.mp3"`,
      "Cache-Control": "no-store",
    },
  });
}
