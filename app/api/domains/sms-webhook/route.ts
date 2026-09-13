import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getDomainSettings } from "@/lib/platform-settings";
import { matchPayment } from "@/lib/domains/orders";

/**
 * Receives a forwarded bKash/Nagad SMS from a phone-side forwarding app.
 * This is real-money-adjacent, so the shared secret is mandatory — there is
 * no other authentication a personal wallet can offer.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "domain-sms-webhook", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const settings = await getDomainSettings();
  const provided = req.headers.get("x-webhook-secret");
  if (!settings.smsWebhookSecret || !provided || provided !== settings.smsWebhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Missing SMS text." }, { status: 400 });

  const result = await matchPayment(text);
  return NextResponse.json({ ok: true, matched: result.matched });
}
