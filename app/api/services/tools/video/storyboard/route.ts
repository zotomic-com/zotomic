/**
 * POST /api/services/tools/video/storyboard
 *
 * Body: { idea: string, character?: string }   // character = cast member id
 *
 * Zotomic AI turns any rough idea into the engine's exact storyboard format.
 * Quota: bundled with the video quota — 1 video = 1 write + 1 render. A write
 * is only allowed while the caller still has video quota left (the render
 * itself keeps consuming videoPerDay as before), so free-tier users can't use
 * this as an unlimited Gemini proxy. Usage is logged as `video_storyboard`.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  resolveToolCaller,
  logUsage,
  countTodayUsage,
  toolRateLimit,
} from "@/lib/services/tools";
import { writeStoryboard, MAX_IDEA_CHARS, MAX_IDEA_CHARS_ADMIN } from "@/lib/videos/storyboard";
import { CHARACTERS } from "@/lib/videos/characters";

export const runtime = "nodejs";
export const maxDuration = 300; // admin storyboards can run long (Gemini + repair pass)

export async function POST(req: NextRequest) {
  const res = await resolveToolCaller(req, "video_generator");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 401 });
  const caller = res.caller;
  const rate = await toolRateLimit(req, "video_storyboard", caller.isAdmin);
  if (rate) return rate;

  let body: { idea?: string; character?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const idea = (body.idea ?? "").trim();
  if (idea.length < 10) {
    return NextResponse.json({ error: "Describe your idea in at least a sentence (10+ characters)." }, { status: 400 });
  }
  const ideaCap = caller.isAdmin ? MAX_IDEA_CHARS_ADMIN : MAX_IDEA_CHARS;
  if (idea.length > ideaCap) {
    return NextResponse.json({ error: `The idea is too long (${ideaCap} characters max).` }, { status: 400 });
  }
  const charId = (body.character ?? "").trim().slice(0, 24);
  const characterName = CHARACTERS.find((c) => c.id === charId)?.name;

  // Bundled quota: writing a storyboard needs video quota remaining (admins unlimited).
  if (!caller.isAdmin) {
    const used = await countTodayUsage({
      service: "video_generator",
      action: "video",
      email: caller.email,
      tokenId: caller.tokenId,
      ip: caller.ip,
    });
    if (used >= caller.limits.videoPerDay) {
      await logUsage({
        service: "video_generator",
        action: "video_storyboard",
        user_email: caller.email,
        token_id: caller.tokenId,
        ip: caller.ip,
        ok: false,
        reason: "quota",
        meta: { chars: idea.length },
      });
      return NextResponse.json(
        {
          error: `Daily limit reached (${caller.limits.videoPerDay} videos/day on your plan) — AI storyboards are part of a video. Come back tomorrow or upgrade.`,
        },
        { status: 429 },
      );
    }
  }

  const result = await writeStoryboard({ idea, characterName, extended: caller.isAdmin });
  if ("error" in result) {
    await logUsage({
      service: "video_generator",
      action: "video_storyboard",
      user_email: caller.email,
      token_id: caller.tokenId,
      ip: caller.ip,
      ok: false,
      reason: result.error.slice(0, 200),
      meta: { chars: idea.length },
    });
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  await logUsage({
    service: "video_generator",
    action: "video_storyboard",
    user_email: caller.email,
    token_id: caller.tokenId,
    ip: caller.ip,
    ok: true,
    meta: { chars: idea.length, scenes: result.scenes, seconds: result.seconds, character: charId || undefined },
  });

  return NextResponse.json({
    storyboard: result.storyboard,
    scenes: result.scenes,
    seconds: result.seconds,
    words: result.words,
  });
}
