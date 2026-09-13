import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getDomainSettings } from "@/lib/platform-settings";
import { checkAvailability } from "@/lib/domains/dynadot";
import { createOrder } from "@/lib/domains/orders";

interface Body {
  domain?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  forwardToEmail?: string;
  pointTo?: string;
  paymentMethod?: string;
}

const clean = (s: unknown, max = 200) => String(s ?? "").trim().slice(0, max);

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "domain-order", limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const settings = await getDomainSettings();
  if (!settings.enabled) return NextResponse.json({ error: "Domain sales are currently unavailable." }, { status: 404 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const domain = clean(body.domain, 253).toLowerCase();
  const customerName = clean(body.customerName, 120);
  const customerPhone = clean(body.customerPhone, 32);
  const paymentMethod = body.paymentMethod === "nagad" ? "nagad" : "bkash";
  const pointTo = body.pointTo === "zotomic" ? "zotomic" : "self";

  if (!domain || !customerName || !customerPhone) {
    return NextResponse.json({ error: "Domain, name and phone are required." }, { status: 400 });
  }

  // Server-authoritative price — re-check with the registrar rather than trusting whatever the client last saw.
  const quote = await checkAvailability([domain]);
  if ("error" in quote) return NextResponse.json({ error: quote.error }, { status: 502 });
  const match = quote.find((q) => q.domain.toLowerCase() === domain);
  if (!match || !match.available || match.wholesaleCost == null) {
    return NextResponse.json({ error: "That domain is no longer available." }, { status: 409 });
  }

  const result = await createOrder({
    domainName: domain,
    customerName,
    customerPhone,
    customerEmail: clean(body.customerEmail, 200) || undefined,
    forwardToEmail: clean(body.forwardToEmail, 200) || undefined,
    pointTo,
    wholesaleCostUsd: match.wholesaleCost,
    paymentMethod,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
