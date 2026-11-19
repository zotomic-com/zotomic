/**
 * Zotomic Converter Service — image, video, and audio conversions.
 *
 * Sub‑services (defined in CONV_TYPE_INFO below):
 *   image:
 *     - images-to-pdf   : images → single PDF
 *     - pdf-to-images   : PDF → individual images (with format/dpi options)
 *   video:
 *     - video-to-video   : re‑encode or change format/quality
 *     - video-to-audio   : extract audio from video
 *     - video-to-gif     : convert video to animated GIF
 *     - video-trim       : trim a video clip
 *     - video-compress   : compress a video (CRF/preset)
 *   audio:
 *     - audio-to-text    : speech‑to‑text transcription
 *     - audio-convert    : convert between audio formats
 *     - audio-compress   : compress audio bitrate
 *     - audio-trim       : trim an audio clip
 *
 * Access model (same as other Zotomic tools):
 *   - session users: entitlements from subscription plan
 *   - service tokens (zt_…): issued in /admin/services/tokens, unlimited for admins
 *   - Admins are unlimited on every service
 *
 * Every attempt is logged to service_usage; per-day quotas are counted from that log.
 */

import crypto from "crypto";
import { NextRequest } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { clientIp, enforceRateLimit } from "@/lib/ratelimit";

/** Converter sub‑service names — kept in sync with CONV_TYPE_INFO keys. */
export type ConvType =
  | "images-to-pdf"
  | "pdf-to-images"
  | "video-to-video"
  | "video-to-audio"
  | "video-to-gif"
  | "video-trim"
  | "video-compress"
  | "audio-to-text"
  | "audio-convert"
  | "audio-compress"
  | "audio-trim";

export type PlanName = "free" | "business" | "pro";

/** Plan entitlements for the converter service. */
export const SERVICE_PLAN_LIMITS: Record<PlanName, {
  converterPerDay: number;
  converterMaxQuality: number | null;
}> = {
  free:     { converterPerDay: 5,   converterMaxQuality: 720 },
  business: { converterPerDay: 30,  converterMaxQuality: null },
  pro:      { converterPerDay: 100, converterMaxQuality: null },
};

/** service → quota‑limit key. */
export const SERVICE_LIMIT_KEY: Record<ConvType, "converterPerDay"> = {
  "images-to-pdf": "converterPerDay",
  "pdf-to-images": "converterPerDay",
  "video-to-video": "converterPerDay",
  "video-to-audio": "converterPerDay",
  "video-to-gif": "converterPerDay",
  "video-trim": "converterPerDay",
  "video-compress": "converterPerDay",
  "audio-to-text": "converterPerDay",
  "audio-convert": "converterPerDay",
  "audio-compress": "converterPerDay",
  "audio-trim": "converterPerDay",
};

/** Human‑readable action name for usage‑log entries. */
export const SERVICE_ACTION: Record<ConvType, "convert"> = {
  "images-to-pdf": "convert",
  "pdf-to-images": "convert",
  "video-to-video": "convert",
  "video-to-audio": "convert",
  "video-to-gif": "convert",
  "video-trim": "convert",
  "video-compress": "convert",
  "audio-to-text": "convert",
  "audio-convert": "convert",
  "audio-compress": "convert",
  "audio-trim": "convert",
};

/** Interface for the caller (session user or service token). */
export interface ConvCaller {
  email: string | null;
  ip: string | null;
  userId: string | null;
  isAdmin: boolean;
  source: "session" | "token" | "guest";
  tokenId: string | null;
  plan: PlanName;
  limits: {
    converterPerDay: number;
    converterMaxQuality: number | null;
  };
}

/** Interface returned by resolveConvCaller. */
export interface ConvResolution {
  caller?: ConvCaller;
  error?: string;
  status?: number;
}

/** Converter library admin row type. */
export interface ConvAdminRow {
  id: string;
  convType: ConvType;
  status: "pending" | "approved" | "rejected";
  definition: {
    convType: ConvType;
    keywords: string[];
    loop: boolean;
    cycle?: number;
    frames: { u: number; pose: Record<string, unknown> }[];
  };
  checks: {
    authored: number;
    rejected: string[];
    sceneTitle?: string;
    visual?: string;
  };
  created_by: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

/** Reset counters to the start of today (UTC). */
function todayStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/* ── signed ticket for browser → engine progress/file calls ─────────────── */

export function signTicket(jobId: string, ttlMs = 30 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const mac = crypto
    .createHmac("sha256", process.env.DOWNLOADER_TICKET_SECRET || "default-ticket-secret")
    .update(`${jobId}.${exp}`)
    .digest("base64url");
  return `${exp}.${mac}`;
}

export function verifyTicket(jobId: string, ticket: string | null): boolean {
  if (!process.env.DOWNLOADER_TICKET_SECRET || !ticket) return false;
  const [expRaw, mac] = ticket.split(".");
  const exp = Number(expRaw);
  if (!exp || !mac || exp < Date.now()) return false;
  const expected = crypto
    .createHmac("sha256", process.env.DOWNLOADER_TICKET_SECRET || "default-ticket-secret")
    .update(`${jobId}.${exp}`)
    .digest("base64url");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  } catch {
    return false;
  }
}

/* ── converter type information ───────────────────────────────────────── */

/**
 * CONV_TYPE_INFO maps each converter type to its UI configuration:
 *   label, accept, multiple, options (format, quality, etc.), needsFile.
 *
 * The first entry for each top‑level group (image / video / audio) is the
 * "default" that appears in the sidebar; the group header toggles the whole
 * block of sub‑types.
 */
export const CONV_TYPE_INFO = {
  /* ── Image group ───────────────────────────────────────────────────── */
  "images-to-pdf": {
    label: "Images → PDF",
    accept: "image/*",
    multiple: true,
    needsFile: true,
    options: [],
  },
  "pdf-to-images": {
    label: "PDF → Images",
    accept: ".pdf",
    multiple: false,
    needsFile: true,
    options: [
      { id: "format", label: "Output format", type: "select", value: "png", options: ["png", "jpg", "jpeg", "webp", "tiff"] },
      { id: "dpi", label: "DPI (quality)", type: "number", value: 150, min: 72, max: 600, step: 1 },
    ],
  },

  /* ── Video group ───────────────────────────────────────────────────── */
  "video-to-video": {
    label: "Video → Video",
    accept: "video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v",
    multiple: false,
    needsFile: true,
    options: [
      { id: "format", label: "Output format", type: "select", value: "mp4", options: ["mp4", "webm", "mov", "mkv"] },
      { id: "quality", label: "Quality", type: "select", value: "original", options: ["original", "high", "medium", "low"] },
    ],
  },
  "video-to-audio": {
    label: "Video → Audio",
    accept: "video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v",
    multiple: false,
    needsFile: true,
    options: [
      { id: "format", label: "Audio format", type: "select", value: "mp3", options: ["mp3", "aac", "ogg", "wav", "flac"] },
      { id: "bitrate", label: "Bitrate", type: "select", value: "192k", options: ["64k", "128k", "192k", "256k", "320k"] },
    ],
  },
  "video-to-gif": {
    label: "Video → GIF",
    accept: "video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v",
    multiple: false,
    needsFile: true,
    options: [
      { id: "fps", label: "FPS", type: "number", value: 10, min: 1, max: 30, step: 1 },
      { id: "scale", label: "Max width", type: "number", value: 480, min: 100, max: 1920, step: 10 },
    ],
  },
  "video-trim": {
    label: "Trim Video",
    accept: "video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v",
    multiple: false,
    needsFile: true,
    options: [
      { id: "start", label: "Start time (HH:MM:SS)", type: "text", value: "00:00:00" },
      { id: "duration", label: "Duration (HH:MM:SS, optional)", type: "text", value: "" },
    ],
  },
  "video-compress": {
    label: "Compress Video",
    accept: "video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v",
    multiple: false,
    needsFile: true,
    options: [
      { id: "crf", label: "CRF (quality)", type: "number", value: 28, min: 18, max: 35, step: 1 },
      { id: "preset", label: "Preset", type: "select", value: "medium", options: ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"] },
    ],
  },

  /* ── Audio group ───────────────────────────────────────────────────── */
  "audio-to-text": {
    label: "Audio → Text",
    accept: "audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac",
    multiple: false,
    needsFile: true,
    options: [
      { id: "language", label: "Language", type: "select", value: "auto", options: ["auto", "en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko", "ar", "hi"] },
    ],
  },
  "audio-convert": {
    label: "Convert Audio",
    accept: "audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus",
    multiple: false,
    needsFile: true,
    options: [
      { id: "format", label: "Output format", type: "select", value: "mp3", options: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"] },
      { id: "bitrate", label: "Bitrate", type: "select", value: "192k", options: ["64k", "128k", "192k", "256k", "320k"] },
    ],
  },
  "audio-compress": {
    label: "Compress Audio",
    accept: "audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac",
    multiple: false,
    needsFile: true,
    options: [
      { id: "bitrate", label: "Target bitrate", type: "select", value: "128k", options: ["32k", "64k", "96k", "128k", "160k", "192k"] },
    ],
  },
  "audio-trim": {
    label: "Trim Audio",
    accept: "audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac",
    multiple: false,
    needsFile: true,
    options: [
      { id: "start", label: "Start time (HH:MM:SS)", type: "text", value: "00:00:00" },
      { id: "duration", label: "Duration (HH:MM:SS, optional)", type: "text", value: "" },
    ],
  },
};

/* ── caller resolution + access check ───────────────────────────────────── */

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

/** Does a token's `services` value grant this type? */
export function convTypeCoversService(services: string, convType: ConvType): boolean {
  if (services === "all") return true;
  // legacy "both" covers the image group only
  if (services === "both") return convType === "images-to-pdf" || convType === "pdf-to-images";
  return services === convType;
}

/**
 * Resolve who is calling (session user or `zt_` service token), verify access
 * for `convType`, and compute effective limits. Never throws — returns an
 * error result the route handler can turn into a JSON response.
 */
export async function resolveConvCaller(req: NextRequest, convType: ConvType): Promise<ConvResolution> {
  const db = getAdminSupabase();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ip = clientIp(req);
  let email: string | null;
  let userId: string | null = null;
  let isAdmin = false;
  let source: ConvCaller["source"] = "session";
  let tokenRow: AccessTokenRow | null = null;

  if (bearer.startsWith("zt_")) {
    const { data } = await db.from("service_tokens").select("*").eq("token", bearer).maybeSingle();
    tokenRow = (data as AccessTokenRow) ?? null;
    if (!tokenRow) return { error: "Invalid service token.", status: 401 };
    if (tokenRow.status !== "active") return { error: "This token has been revoked.", status: 403 };
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now())
      return { error: "This token has expired.", status: 403 };
    if (!convTypeCoversService(tokenRow.services, convType))
      return { error: "This token is not authorized for this converter type.", status: 403 };
    email = tokenRow.user_email;
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
            converterPerDay: SERVICE_PLAN_LIMITS.free.converterPerDay,
            converterMaxQuality: SERVICE_PLAN_LIMITS.free.converterMaxQuality,
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
    .eq("service", convType)
    .maybeSingle();
  const access = (accessRow as AccessRow | null) ?? null;
  if (access?.mode === "block" && !isAdmin) {
    return { error: "You do not have access to this converter type.", status: 403 };
  }

  // Plan defaults (admins skip — unlimited).
  let plan: PlanName = "free";
  if (!isAdmin) plan = await resolvePlan(db, userId ?? "");
  const planLimits = SERVICE_PLAN_LIMITS[plan];

  // Effective limits: most restrictive of plan / access override / token limit.
  const limitKey = SERVICE_LIMIT_KEY[convType];
  const candidates: Array<number | null> = [isAdmin ? null : planLimits[limitKey]];
  if (access?.mode === "allow" && access.daily_limit != null) candidates.push(access.daily_limit);
  if (tokenRow?.daily_limit != null) candidates.push(tokenRow.daily_limit);
  const effective = candidates.filter((n): n is number => n != null);
  const dailyLimit = isAdmin ? Number.POSITIVE_INFINITY : effective.length ? Math.min(...effective) : Number.POSITIVE_INFINITY;

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
        converterPerDay: SERVICE_PLAN_LIMITS[plan].converterPerDay,
        converterMaxQuality: planLimits.converterMaxQuality,
        // the calling service gets the effective (most restrictive) limit
        ...("images-to-pdf" === convType || "pdf-to-images" === convType ? { converterPerDay: dailyLimit } : {}),
        ...(["video-to-video", "video-to-audio", "video-to-gif", "video-trim", "video-compress"].includes(convType) ? { converterPerDay: dailyLimit } : {}),
        ...(["audio-to-text", "audio-convert", "audio-compress", "audio-trim"].includes(convType) ? { converterPerDay: dailyLimit } : {}),
      },
    },
  };
}

/* ── usage logging + quota counting ─────────────────────────────────────── */

export async function logUsage(entry: {
  service: ConvType;
  action: "convert";
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
  service: ConvType;
  action: "convert";
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
export async function quotaStatus(caller: ConvCaller, service: ConvType) {
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
    plan: caller.plan,
  };
}

/** Cap a requested quality to the caller's max (720 …). */
export function clampQuality(qualityId: string | undefined, maxQuality: number | null): string {
  if (maxQuality == null) return qualityId || "best";
  // qualityId like "h720" → number; keep it if ≤ maxQuality
  const m = /^h(\d+)$/.exec(qualityId ?? "");
  if (m) return Number(m[1]) <= maxQuality ? qualityId! : `h${maxQuality}`;
  return `h${maxQuality}`;
}

/* ── rate limit (same 20/min per-IP for non‑admins) ─────────────────────── */
export function convRateLimit(req: NextRequest, name: string, isAdmin = false) {
  if (isAdmin) return null;
  return enforceRateLimit(req, {
    name,
    limit: 20,
    windowMs: 60_000,
    key: clientIp(req),
    message: "Too many requests — slow down and try again in a minute.",
  });
}

/* ── engine call helper ───────────────────────────────────────────────── */

export async function engineFetch(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 25_000);
  try {
    return await fetch(`${process.env.RENDER_API_URL || "https://freedownloder-api.onrender.com"}${path}`, {
      method: init.method ?? "POST",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        "X-API-Key": process.env.DOWNLOADER_API_KEY || "",
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/* ── plan resolution across a user's businesses ──────────────────────────── */

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
      if (SERVICE_PLAN_LIMITS.free.converterPerDay < SERVICE_PLAN_LIMITS[p as PlanName].converterPerDay) best = p as PlanName;
    }
  }
  return best;
}

/* ── converter library admin functions ──────────────────────────────────── */

export async function listConvAnims(status?: "pending" | "approved" | "rejected"): Promise<ConvAdminRow[]> {
  const db = getAdminSupabase();
  let q = db.from("conv_library").select("*").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  return error ? [] : (data as ConvAdminRow[]);
}

export async function savePendingConvAnim(input: {
  convType: ConvType;
  definition: {
    convType: ConvType;
    keywords: string[];
    loop: boolean;
    cycle?: number;
    frames: { u: number; pose: Record<string, unknown> }[];
  };
  checks: {
    authored: number;
    rejected: string[];
    sceneTitle?: string;
    visual?: string;
  };
  createdBy: string | null;
}): Promise<void> {
  const db = getAdminSupabase();
  await db.from("conv_library").upsert(
    {
      convType: input.convType,
      keywords: input.definition.keywords,
      definition: input.definition,
      status: "pending",
      checks: input.checks,
      created_by: input.createdBy,
      decided_at: null,
      decided_by: null,
    },
    { onConflict: "convType" },
  );
}