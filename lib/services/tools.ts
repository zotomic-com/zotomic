/**
 * Service tools — Text to Audio + Online Downloader.
 *
 * Both tools are thin Zotomic front-ends over the same render-hosted engine
 * (RENDER_API_URL). All engine calls are made server-side with the
 * DOWNLOADER_API_KEY; the browser only ever talks to Zotomic, except for
 * progress polling + file download, which go straight to the engine with a
 * short-lived signed ticket (?t=<exp>.<hmac>).
 *
 * Access model:
 *   - session users: default entitlements come from their subscription plan
 *     (SERVICE_PLAN_LIMITS); per-user service_access rows can override
 *     ('allow' with custom limits) or block outright. Admins are unlimited.
 *   - service tokens (`zt_…`): platform-issued in /admin/services/tokens,
 *     bound to a user's email; token.daily_limit can lower the plan limit.
 *     Users can never generate tokens themselves.
 *
 * Every attempt is written to service_usage; per-day quotas are counted from
 * that log (ok = true rows since UTC midnight).
 */
import crypto from "crypto";
import { NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { clientIp, enforceRateLimit } from "@/lib/ratelimit";

export type ToolService = "downloader" | "text_to_audio" | "video_generator";
export type PlanName = "free" | "business" | "pro";

export const RENDER_API_URL = process.env.RENDER_API_URL || "https://freedownloder-api.onrender.com";
const API_KEY = process.env.DOWNLOADER_API_KEY || "";
const TICKET_SECRET = process.env.DOWNLOADER_TICKET_SECRET || "";

export const TTS_MAX_CHARS = 3000;

/** Plan entitlements for the tools ("follow the price system" defaults). */
export const SERVICE_PLAN_LIMITS: Record<
  PlanName,
  { downloaderPerDay: number; downloaderMaxQuality: number | null; ttsPerDay: number; videoPerDay: number }
> = {
  free: { downloaderPerDay: 5, downloaderMaxQuality: 720, ttsPerDay: 3, videoPerDay: 3 },
  business: { downloaderPerDay: 30, downloaderMaxQuality: null, ttsPerDay: 20, videoPerDay: 20 },
  pro: { downloaderPerDay: 100, downloaderMaxQuality: null, ttsPerDay: 100, videoPerDay: 50 },
};

export const PLAN_RANK: Record<PlanName, number> = { free: 0, business: 1, pro: 2 };

/** service → (quota limit key, usage-log action). */
export const SERVICE_LIMIT_KEY: Record<ToolService, "downloaderPerDay" | "ttsPerDay" | "videoPerDay"> = {
  downloader: "downloaderPerDay",
  text_to_audio: "ttsPerDay",
  video_generator: "videoPerDay",
};
export const SERVICE_ACTION: Record<ToolService, "download_start" | "tts" | "video"> = {
  downloader: "download_start",
  text_to_audio: "tts",
  video_generator: "video",
};

export interface ToolLimits {
  downloaderPerDay: number;
  downloaderMaxQuality: number | null;
  ttsPerDay: number;
  videoPerDay: number;
}

export interface ToolCaller {
  /** null for guests (quota is then counted per IP). */
  email: string | null;
  ip: string | null;
  userId: string | null;
  isAdmin: boolean;
  source: "session" | "token" | "guest";
  tokenId: string | null;
  plan: PlanName;
  limits: ToolLimits;
}

export interface ToolResolution {
  caller?: ToolCaller;
  error?: string;
  status?: number;
}

function todayStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/* ── signed ticket for browser → engine progress/file calls ─────────────── */

export function signTicket(jobId: string, ttlMs = 30 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const mac = crypto
    .createHmac("sha256", TICKET_SECRET)
    .update(`${jobId}.${exp}`)
    .digest("base64url");
  return `${exp}.${mac}`;
}

export function verifyTicket(jobId: string, ticket: string | null): boolean {
  if (!TICKET_SECRET || !ticket) return false;
  const [expRaw, mac] = ticket.split(".");
  const exp = Number(expRaw);
  if (!exp || !mac || exp < Date.now()) return false;
  const expected = crypto
    .createHmac("sha256", TICKET_SECRET)
    .update(`${jobId}.${exp}`)
    .digest("base64url");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  } catch {
    return false;
  }
}

/* ── engine (Render) calls — always server-side, always with the API key ── */

export async function engineFetch(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 25_000);
  try {
    return await fetch(`${RENDER_API_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        "X-API-Key": API_KEY,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/* ── caller resolution + access check ───────────────────────────────────── */

/** Best plan across the user's businesses; defaults to free. */
async function resolvePlan(db: ReturnType<typeof getAdminSupabase>, userId: string): Promise<PlanName> {
  const { data } = await db
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId);
  const ids = (data ?? []).map((r: { business_id: string }) => r.business_id);
  if (!ids.length) return "free";
  const { data: subs } = await db
    .from("subscriptions")
    .select("plan")
    .in("business_id", ids)
    .eq("status", "active");
  let best: PlanName = "free";
  for (const s of subs ?? []) {
    const p = (s.plan as string) ?? "free";
    if (p === "pro" || p === "business") {
      if (PLAN_RANK[p as PlanName] > PLAN_RANK[best]) best = p as PlanName;
    }
  }
  return best;
}

interface AccessTokenRow {
  id: string;
  status: string;
  expires_at: string | null;
  daily_limit: number | null;
  services: string;
  user_email: string;
}

interface AccessRow {
  mode: "plan" | "allow" | "block";
  daily_limit: number | null;
  max_quality: string | null;
}

/** Does a token's `services` value grant this service? ("both" = legacy
 * downloader+text_to_audio pair; "all" = every tool including video.) */
export function tokenCoversService(services: string, service: ToolService): boolean {
  if (services === "all") return true;
  if (services === "both") return service === "downloader" || service === "text_to_audio";
  return services === service;
}

/**
 * Resolve who is calling (session user or `zt_` service token), verify access
 * for `service`, and compute effective limits. Never throws — returns an
 * error result the route handler can turn into a JSON response.
 */
export async function resolveToolCaller(req: NextRequest, service: ToolService): Promise<ToolResolution> {
  const db = getAdminSupabase();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ip = clientIp(req);
  let email: string | null;
  let userId: string | null = null;
  let isAdmin = false;
  let source: ToolCaller["source"] = "session";
  let tokenRow: AccessTokenRow | null = null;

  if (bearer.startsWith("zt_")) {
    const { data } = await db.from("service_tokens").select("*").eq("token", bearer).maybeSingle();
    tokenRow = (data as AccessTokenRow) ?? null;
    if (!tokenRow) return { error: "Invalid service token.", status: 401 };
    if (tokenRow.status !== "active") return { error: "This token has been revoked.", status: 403 };
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now())
      return { error: "This token has expired.", status: 403 };
    if (!tokenCoversService(tokenRow.services, service))
      return { error: "This token is not authorized for this service.", status: 403 };    email = tokenRow.user_email;
    source = "token";
  } else {
    const user = await getAuthUser(req);
    if (!user) {
      /* Guests: no signup needed — free-plan limits, counted per IP. */
      return {
        caller: {
          email: null,
          ip,
          userId: null,
          isAdmin: false,
          source: "guest",
          tokenId: null,
          plan: "free",
          limits: {
            downloaderPerDay: SERVICE_PLAN_LIMITS.free.downloaderPerDay,
            ttsPerDay: SERVICE_PLAN_LIMITS.free.ttsPerDay,
            videoPerDay: SERVICE_PLAN_LIMITS.free.videoPerDay,
            downloaderMaxQuality: SERVICE_PLAN_LIMITS.free.downloaderMaxQuality,
          },
        },
      };
    }
    const { data: live } = await db.from("users").select("role, status, blocked").eq("id", user.id).maybeSingle();
    if (!live || live.status === "suspended" || live.blocked) return { error: "Your account cannot use this service.", status: 403 };
    email = user.email;
    userId = user.id;
    isAdmin = live.role === "admin";
  }

  // Per-user access control (block / allow / plan).
  const { data: accessRow } = await db
    .from("service_access")
    .select("mode, daily_limit, max_quality")
    .eq("user_email", email)
    .eq("service", service)
    .maybeSingle();
  const access = (accessRow as AccessRow | null) ?? null;
  if (access?.mode === "block" && !isAdmin) {
    return { error: "You do not have access to this service.", status: 403 };
  }

  // Plan defaults (admins skip — unlimited).
  let plan: PlanName = "free";
  if (!isAdmin) plan = await resolvePlan(db, userId ?? "");
  const planLimits = SERVICE_PLAN_LIMITS[plan];

  // Effective limits: most restrictive of plan / access override / token limit.
  const limitKey = SERVICE_LIMIT_KEY[service];
  const candidates: Array<number | null> = [isAdmin ? null : planLimits[limitKey]];
  if (access?.mode === "allow" && access.daily_limit != null) candidates.push(access.daily_limit);
  if (tokenRow?.daily_limit != null) candidates.push(tokenRow.daily_limit);
  const effective = candidates.filter((n): n is number => n != null);
  const dailyLimit = isAdmin ? Number.POSITIVE_INFINITY : effective.length ? Math.min(...effective) : Number.POSITIVE_INFINITY;

  const qualityCandidates: Array<number | null> = [];
  if (access?.mode === "allow" && access.max_quality) qualityCandidates.push(Number(access.max_quality));
  if (!isAdmin && planLimits.downloaderMaxQuality) qualityCandidates.push(planLimits.downloaderMaxQuality);
  const qualityNums = qualityCandidates.filter((n): n is number => n != null);
  const maxQuality = qualityNums.length ? Math.min(...qualityNums) : null;

  return {
    caller: {
      email,
      ip,
      userId,
      isAdmin,
      source,
      tokenId: tokenRow?.id ?? null,
      plan,
      limits: {
        downloaderPerDay: SERVICE_PLAN_LIMITS[plan].downloaderPerDay,
        ttsPerDay: SERVICE_PLAN_LIMITS[plan].ttsPerDay,
        videoPerDay: SERVICE_PLAN_LIMITS[plan].videoPerDay,
        downloaderMaxQuality: maxQuality,
        // the calling service gets the effective (most restrictive) limit
        ...(service === "downloader" ? { downloaderPerDay: dailyLimit } : {}),
        ...(service === "text_to_audio" ? { ttsPerDay: dailyLimit } : {}),
        ...(service === "video_generator" ? { videoPerDay: dailyLimit } : {}),
      },
    },
  };
}

/* ── usage logging + quota counting ─────────────────────────────────────── */

export async function logUsage(entry: {
  service: ToolService;
  action: "info" | "download_start" | "file" | "tts" | "voices" | "video";
  user_email?: string | null;
  token_id?: string | null;
  ip?: string | null;
  ok?: boolean;
  reason?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    await getAdminSupabase().from("service_usage").insert({
      service: entry.service,
      action: entry.action,
      user_email: entry.user_email ?? null,
      token_id: entry.token_id ?? null,
      ip: entry.ip ?? null,
      ok: entry.ok ?? true,
      reason: entry.reason ?? null,
      meta: entry.meta ?? {},
    });
    if (entry.token_id && (entry.ok ?? true)) {
      const db = getAdminSupabase();
      const { data: row } = await db
        .from("service_tokens")
        .select("usage_count")
        .eq("id", entry.token_id)
        .maybeSingle();
      await db
        .from("service_tokens")
        .update({ usage_count: ((row?.usage_count as number) ?? 0) + 1, last_used_at: new Date().toISOString() })
        .eq("id", entry.token_id);
    }
  } catch {
    // logging must never break the tool
  }
}

/** Successful paid actions today (UTC) for this user, token — or, for
 * guests, this IP (rows where user_email is null and the ip matches). */
export async function countTodayUsage(opts: {
  service: ToolService;
  action: "download_start" | "tts" | "video";
  email: string | null;
  tokenId: string | null;
  ip?: string | null;
}): Promise<number> {
  const db = getAdminSupabase();
  let query = db
    .from("service_usage")
    .select("id", { count: "exact", head: true })
    .eq("service", opts.service)
    .eq("action", opts.action)
    .eq("ok", true)
    .gte("created_at", todayStartIso());
  if (opts.tokenId) query = query.or(`user_email.eq.${opts.email},token_id.eq.${opts.tokenId}`);
  else if (opts.email) query = query.eq("user_email", opts.email);
  else if (opts.ip) query = query.eq("ip", opts.ip).is("user_email", null);
  const { count } = await query;
  return count ?? 0;
}

/** Remaining quota info for the UI. */
export async function quotaStatus(caller: ToolCaller, service: ToolService) {
  const action = SERVICE_ACTION[service];
  const limitKey = SERVICE_LIMIT_KEY[service];
  const used = await countTodayUsage({
    service,
    action,
    email: caller.email,
    tokenId: caller.tokenId,
    ip: caller.ip,
  });
  const limit = caller.limits[limitKey];
  return {
    service,
    used,
    limit: Number.isFinite(limit) ? limit : null, // null = unlimited
    remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : null,
    maxQuality: caller.limits.downloaderMaxQuality,
    plan: caller.plan,
  };
}

/** Standard per-IP burst guards (in addition to per-day quotas). */
export function toolRateLimit(req: NextRequest, name: string) {
  return enforceRateLimit(req, {
    name,
    limit: 20,
    windowMs: 60_000,
    key: clientIp(req),
    message: "Too many requests — slow down and try again in a minute.",
  });
}

/** Cap a requested video quality to the caller's max (720 …). */
export function clampQuality(qualityId: string | undefined, maxQuality: number | null): string {
  if (maxQuality == null) return qualityId || "best";
  const m = /^h(\d+)$/.exec(qualityId ?? "");
  if (m) return Number(m[1]) <= maxQuality ? qualityId! : `h${maxQuality}`;
  return `h${maxQuality}`;
}
