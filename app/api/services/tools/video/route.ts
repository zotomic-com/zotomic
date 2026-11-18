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
import { parseStoryboardText, sceneHasKnownAction } from "@/lib/videos/anim-dsl";
import { authorAnims } from "@/lib/videos/anim-author";
import { findApprovedAnims, savePendingAnim } from "@/lib/videos/anim-library";

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
  const res = await resolveToolCaller(req, "video_generator");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status });
  const caller = res.caller;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const limited = toolRateLimit(req, "video_start", caller.isAdmin);
  if (limited) return limited;

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
  const maxChars = caller.isAdmin ? 20000 : 5000;
  if (text.length < 10) return NextResponse.json({ error: "Please write at least a sentence (10+ characters)." }, { status: 400 });
  if (text.length > maxChars) return NextResponse.json({ error: `Script is too long (${maxChars} characters max — about 60 seconds of video).` }, { status: 400 });
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

  // ── AI animation library (write-once-verify-once) ─────────────────────────
  // Storyboard scenes whose action the engine doesn't know fall back to
  // generic actions. We upgrade them: approved library animations attach
  // silently; on paid plans/admins Gemini writes + debugs NEW ones (saved as
  // pending for admin approval). Free plans keep the built-in fallbacks.
  let anims: { slug: string; keywords: string[]; loop: boolean; cycle?: number; frames: { u: number; pose: Record<string, unknown> }[] }[] = [];
  try {
    const scenes = parseStoryboardText(text);
    const gapScenes = scenes.filter((s) => !sceneHasKnownAction(`${s.title} ${s.visual}`));
    if (gapScenes.length) {
      const texts = scenes.map((s) => `${s.title} ${s.visual}`);
      // approved library entries first — zero AI cost, instant
      const library = await findApprovedAnims(texts);
      let unmatched = gapScenes.filter((s) => {
        const t = `${s.title} ${s.visual}`;
        return !library.some((row) => row.keywords.some((k) => new RegExp(`\\b${String(k).replace(/[^a-z0-9 ']/g, ".")}\\b`, "i").test(t)));
      });
      anims = library.map((row) => ({
        slug: row.slug,
        keywords: row.keywords,
        loop: row.definition.loop,
        cycle: row.definition.cycle,
        frames: row.definition.frames,
      }));
      // author the still-unmatched ones (plan-gated: paid plans + admins only)
      if (unmatched.length && (caller.isAdmin || caller.plan !== "free")) {
        const res = await authorAnims({ scenes, characterName: character || undefined, canAuthor: true });
        anims.push(
          ...res.anims.map((a) => ({
            slug: a.slug,
            keywords: a.keywords,
            loop: a.loop,
            cycle: a.cycle,
            frames: a.frames,
          })),
        );
        // write-once: every debugged-clean anim joins the library as pending
        for (const a of res.anims) {
          const scene = scenes[a.sceneIndex];
          await savePendingAnim({
            slug: a.slug,
            definition: { slug: a.slug, keywords: a.keywords, loop: a.loop, cycle: a.cycle, frames: a.frames },
            checks: { authored: res.authored, rejected: res.rejected, sceneTitle: scene?.title, visual: scene?.visual },
            createdBy: caller.userId,
          }).catch(() => {});
        }
        if (res.authored || res.rejected.length) {
          await logUsage({
            service: "video_generator",
            action: "anim_author",
            user_email: caller.email,
            token_id: caller.tokenId,
            ip,
            ok: res.authored > 0,
            reason: res.rejected.slice(0, 2).join(" | ").slice(0, 180) || undefined,
            meta: { authored: res.authored, rejected: res.rejected.length },
          });
        }
      }
    }
  } catch (e) {
    console.error("anim library", (e as Error).message); // never block the video
  }

  let engine: Response;
  try {
    engine = await engineFetch("/api/video", {
      method: "POST",
      // admins get unlimited video time (engine hard-caps at 900s ≈ 15 min)
      body: { text, voice, style, character, audioStyle, ...(anims.length ? { anims } : {}), ...(caller.isAdmin ? { maxLen: 900 } : {}) },
      timeoutMs: 30_000,
    });
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
