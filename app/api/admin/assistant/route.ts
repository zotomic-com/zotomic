import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { adminAgentConfigured } from "@/lib/agent/admin-agent";
import { adminTurn } from "@/lib/agent/admin-turn";

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

  if (!message && !approve && !cancel) {
    return NextResponse.json({ error: "Empty message." }, { status: 400 });
  }

  try {
    const res = await adminTurn({ adminId: admin.id, channel: "web", conversationId, message, approve, cancel });
    return NextResponse.json({
      conversationId: res.conversationId,
      reply: res.reply,
      pending: res.pendingPreview ? { preview: res.pendingPreview } : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
