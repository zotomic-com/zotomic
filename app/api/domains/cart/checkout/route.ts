import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getAuthUser } from "@/lib/auth-server";
import { getDomainSettings } from "@/lib/platform-settings";
import { createCartOrder, type CartCheckoutItem } from "@/lib/domains/orders";

interface Body {
  items?: { type?: string; domainName?: string; authCode?: string; pointTo?: string; forwardToEmail?: string }[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  paymentMethod?: string;
}

const clean = (s: unknown, max = 200) => String(s ?? "").trim().slice(0, max);

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "domain-cart-checkout", limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  // Buying a domain requires a Zotomic account — orders attach to whoever is signed in.
  const authUser = await getAuthUser(req);
  if (!authUser) return NextResponse.json({ error: "Please sign in to check out." }, { status: 401 });

  const settings = await getDomainSettings();
  if (!settings.enabled) return NextResponse.json({ error: "Domain sales are currently unavailable." }, { status: 404 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const customerName = clean(body.customerName, 120);
  const customerPhone = clean(body.customerPhone, 32);
  const paymentMethod = body.paymentMethod === "nagad" ? "nagad" : "bkash";
  if (!customerName || !customerPhone) return NextResponse.json({ error: "Name and phone are required." }, { status: 400 });

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
  if (rawItems.length === 0) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });

  const items: CartCheckoutItem[] = [];
  for (const i of rawItems) {
    const domainName = clean(i.domainName, 253).toLowerCase();
    if (!domainName) return NextResponse.json({ error: "Every cart item needs a domain name." }, { status: 400 });
    items.push({
      type: i.type === "transfer" ? "transfer" : "register",
      domainName,
      authCode: i.authCode ? clean(i.authCode, 100) : undefined,
      pointTo: i.pointTo === "zotomic" ? "zotomic" : "self",
      forwardToEmail: i.forwardToEmail ? clean(i.forwardToEmail, 200) : undefined,
    });
  }

  const result = await createCartOrder({
    userId: authUser.id,
    customerName,
    customerPhone,
    customerEmail: clean(body.customerEmail, 200) || undefined,
    paymentMethod,
    items,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
