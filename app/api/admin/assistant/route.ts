import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { adminAgentConfigured } from "@/lib/agent/admin-agent";
import { adminTurn } from "@/lib/agent/admin-turn";
import { MEDIA_MAX_BYTES, MEDIA_TOTAL_MAX_BYTES, mediaKind, normalizeMime, type MediaPart } from "@/lib/ai/media";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const burst = enforceRateLimit(req, { name: "admin-assistant", key: admin.id, limit: 12, windowMs: 30_000 });
  if (burst) return burst;
  if (!adminAgentConfigured()) {
    return NextResponse.json({ error: "The assistant is not configured (no AI key)." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  const approve = body.approve === true;
  const cancel = body.cancel === true;
  const confirmText = typeof body.confirmText === "string" ? body.confirmText.trim().slice(0, 40) : undefined;

  // validate attachments (base64 data URIs or {mimeType,dataBase64})
  const attachments: MediaPart[] = [];
  let total = 0;
  for (const a of Array.isArray(body.attachments) ? body.attachments.slice(0, 4) : []) {
    const mimeType = typeof a?.mimeType === "string" ? a.mimeType : "";
    const dataBase64 = typeof a?.dataBase64 === "string" ? a.dataBase64.replace(/^data:[^,]+,/, "") : "";
    if (!mimeType || !dataBase64) continue;
    if (!mediaKind(normalizeMime(mimeType))) {
      return NextResponse.json({ error: `${a?.name ?? "A file"} isn't a supported image/audio/video type.` }, { status: 400 });
    }
    const bytes = Math.ceil((dataBase64.length * 3) / 4);
    total += bytes;
    if (bytes > MEDIA_MAX_BYTES) {
      return NextResponse.json({ error: `${a?.name ?? "A file"} is over ${Math.round(MEDIA_MAX_BYTES / 1024 / 1024)} MB.` }, { status: 400 });
    }
    attachments.push({ mimeType, dataBase64, name: typeof a?.name === "string" ? a.name : undefined });
  }
  if (total > MEDIA_TOTAL_MAX_BYTES) {
    return NextResponse.json({ error: "Those files are too large together — send one at a time." }, { status: 400 });
  }

  if (!message && !approve && !cancel && !attachments.length) {
    return NextResponse.json({ error: "Empty message." }, { status: 400 });
  }

  try {
    const res = await adminTurn({
      adminId: admin.id,
      channel: "web",
      conversationId,
      message: message || (attachments.length ? "Have a look at this." : ""),
      attachments: attachments.length ? attachments : undefined,
      approve,
      confirmText,
      cancel,
    });
    return NextResponse.json({
      conversationId: res.conversationId,
      reply: res.reply,
      pending: res.pendingPreview ? { preview: res.pendingPreview, confirmWord: res.confirmWord } : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
