import { NextResponse } from "next/server";
import {
  MESSAGING_PROVIDERS,
  findChannelByVerifyToken,
  verifyMetaSignature,
  parseInbound,
  recordInbound,
} from "@/lib/messaging";
import { getAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta webhook verification handshake. */
export async function GET(req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  if (mode !== "subscribe") return new NextResponse("Bad request", { status: 400 });

  const channel = await findChannelByVerifyToken(token);
  if (!channel || channel.business_id !== businessId) {
    return new NextResponse("Verification failed", { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

/** Inbound Messenger / WhatsApp / Instagram events. */
export async function POST(req: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const raw = await req.text();

  let payload: { object?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const providerEntry = Object.values(MESSAGING_PROVIDERS).find((p) => p.webhookObject === payload.object);
  if (!providerEntry) return NextResponse.json({ ok: true, ignored: payload.object ?? "unknown" });
  const provider = providerEntry.id;

  const db = getAdminSupabase();
  const { data: channel } = await db
    .from("messaging_channels")
    .select("id, status")
    .eq("business_id", businessId)
    .eq("provider", provider)
    .maybeSingle();
  if (!channel) return NextResponse.json({ ok: true, ignored: "no channel" });

  const sigOk = await verifyMetaSignature(businessId, provider, raw, req.headers.get("x-hub-signature-256"));
  if (!sigOk) {
    await db
      .from("messaging_channels")
      .update({ status: "error", last_error: "Webhook signature verification failed" })
      .eq("id", channel.id);
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const messages = parseInbound(provider, payload);
  await recordInbound(businessId, channel.id as string, provider, messages, payload);

  // Meta expects a fast 200
  return NextResponse.json({ ok: true, received: messages.length });
}
