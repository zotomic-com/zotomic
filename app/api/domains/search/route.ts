import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getDomainSettings } from "@/lib/platform-settings";
import { searchWithSuggestions } from "@/lib/domains/orders";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "domain-search", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const settings = await getDomainSettings();
  if (!settings.enabled) return NextResponse.json({ error: "Domain sales are currently unavailable." }, { status: 404 });

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const query = String(body.query ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "");
  if (!query || query.length < 2) return NextResponse.json({ error: "Enter a domain or name to search." }, { status: 400 });

  const results = await searchWithSuggestions(query);
  if ("error" in results) return NextResponse.json({ error: results.error }, { status: 502 });
  return NextResponse.json({ ok: true, results });
}
