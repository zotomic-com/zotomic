/**
 * Lightweight in-process rate limiting. Fixed-window counters kept in a module
 * Map — no Redis, no schema. On serverless this is best-effort per warm
 * instance, which is still enough to blunt brute-force and spam bursts (a single
 * instance handles many requests before it recycles). For hard multi-instance
 * guarantees we'd move this to Postgres/Redis later.
 */
import { NextRequest, NextResponse } from "next/server";

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(k);
  }
}

export interface RateResult {
  ok: boolean;
  /** seconds until the window resets (only meaningful when !ok) */
  retryAfter: number;
  remaining: number;
}

/**
 * Register one hit against `key`. Returns `ok:false` once `limit` hits have
 * occurred inside the rolling `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);

  let w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    buckets.set(key, w);
  }
  w.count += 1;

  const remaining = Math.max(0, limit - w.count);
  if (w.count > limit) {
    return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000), remaining: 0 };
  }
  return { ok: true, retryAfter: 0, remaining };
}

/** Best-effort client IP from the usual proxy headers. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(retryAfter: number, message?: string): NextResponse {
  return NextResponse.json(
    { error: message ?? "Too many requests. Slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
  );
}

/**
 * One-liner guard for route handlers:
 *
 *   const limited = enforceRateLimit(req, { name: "login", limit: 10, windowMs: 60_000 });
 *   if (limited) return limited;
 */
export function enforceRateLimit(
  req: NextRequest,
  opts: { name: string; limit: number; windowMs: number; key?: string; message?: string },
): NextResponse | null {
  const id = opts.key ?? clientIp(req);
  const res = rateLimit(`${opts.name}:${id}`, opts.limit, opts.windowMs);
  return res.ok ? null : tooManyRequests(res.retryAfter, opts.message);
}
