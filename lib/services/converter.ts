/**
 * Zotomic Converter — service registry.
 *
 * The converter is one Zotomic service with many sub-services (Images → PDF,
 * Video → GIF, Trim Audio …). Every sub-service is a row in `converter_types`,
 * so admins can add, edit, reorder, disable or delete them from
 * /admin/services/converter without a deploy.
 *
 * Conversions run on the Render engine (ffmpeg / img2pdf / pdftoppm). The
 * browser uploads the file straight to the engine with a short-lived signed
 * ticket so multi-hundred-MB videos never pass through Vercel's 4.5 MB body
 * limit. Audio → Text is the one exception: it is transcribed by Gemini on the
 * site itself, so that file is posted to /api/converter/transcribe.
 */
import "server-only";
import crypto from "crypto";
import { getAdminSupabase } from "@/lib/supabase";

export const CONV_GROUPS = [
  { id: "image", label: "Image", blurb: "Photos and PDFs" },
  { id: "document", label: "Document", blurb: "Word, Excel, PowerPoint" },
  { id: "video", label: "Video", blurb: "Clips, GIFs, soundtracks" },
  { id: "audio", label: "Audio", blurb: "Music, voice, podcasts" },
  { id: "text", label: "Text", blurb: "Translate, Bijoy, encode" },
  { id: "ai", label: "AI Image", blurb: "Backgrounds & overlays" },
] as const;

export type ConvGroup = (typeof CONV_GROUPS)[number]["id"];

export type ConvOptionType = "select" | "number" | "text" | "textarea";

export interface ConvOption {
  id: string;
  label: string;
  type: ConvOptionType;
  value: string | number;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  rows?: number;
}

export interface ConvType {
  id: string;
  slug: string;
  label: string;
  group: ConvGroup;
  description: string | null;
  accept: string;
  multiple: boolean;
  needsFile: boolean;
  options: ConvOption[];
  enabled: boolean;
  sortOrder: number;
}

/** Sub-services handled by the site itself instead of the Render engine. */
export const SITE_TEXT_TYPES = new Set([
  "text-translate",
  "unicode-to-bijoy",
  "bijoy-to-unicode",
  "text-case",
  "text-encode",
  "text-hash",
  "text-diff",
  "text-count",
]);

/** Text → speech, streamed from the engine's edge-tts endpoint. */
export const SITE_TTS_TYPES = new Set(["text-to-audio"]);

/** Transcribed by Gemini from a file the browser posts to the site. */
export const TRANSCRIBE_UPLOAD_TYPES = new Set(["audio-to-text"]);

/** The engine extracts the audio track first, then the site transcribes it. */
export const TRANSCRIBE_JOB_TYPES = new Set(["video-to-text", "video-to-skill"]);

export const SITE_SIDE_TYPES = new Set<string>([
  ...SITE_TEXT_TYPES,
  ...SITE_TTS_TYPES,
  ...TRANSCRIBE_UPLOAD_TYPES,
  ...TRANSCRIBE_JOB_TYPES,
]);

export type ConvTransport = "engine" | "text" | "tts" | "transcribe" | "transcribe-job";

/** How the browser should run a given sub-service. */
export function convTransport(slug: string): ConvTransport {
  if (SITE_TEXT_TYPES.has(slug)) return "text";
  if (SITE_TTS_TYPES.has(slug)) return "tts";
  if (TRANSCRIBE_UPLOAD_TYPES.has(slug)) return "transcribe";
  if (TRANSCRIBE_JOB_TYPES.has(slug)) return "transcribe-job";
  return "engine";
}

/** Hard cap for site-side uploads (Vercel request body limit). */
export const SITE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** Hard cap for audio the site pulls from the engine to transcribe. */
export const TRANSCRIBE_MAX_BYTES = 20 * 1024 * 1024;

/** Hard cap for engine uploads. */
export const ENGINE_UPLOAD_MAX_BYTES = 512 * 1024 * 1024;

const TICKET_SECRET = process.env.DOWNLOADER_TICKET_SECRET || "";

function rowToType(r: Record<string, unknown>): ConvType {
  const raw = Array.isArray(r.options) ? (r.options as ConvOption[]) : [];
  return {
    id: r.id as string,
    slug: r.slug as string,
    label: r.label as string,
    group: (r.grp as ConvGroup) ?? "image",
    description: (r.description as string) ?? null,
    accept: (r.accept as string) ?? "",
    multiple: !!r.multiple,
    needsFile: r.needs_file === undefined ? true : !!r.needs_file,
    options: raw.filter((o) => o && typeof o.id === "string"),
    enabled: r.enabled === undefined ? true : !!r.enabled,
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

/** Every sub-service, ordered. `onlyEnabled` is what the public page uses. */
export async function listConvTypes(opts: { onlyEnabled?: boolean } = {}): Promise<ConvType[]> {
  const db = getAdminSupabase();
  let q = db.from("converter_types").select("*").order("sort_order").order("label");
  if (opts.onlyEnabled) q = q.eq("enabled", true);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(rowToType);
}

export async function getConvType(slug: string): Promise<ConvType | null> {
  const db = getAdminSupabase();
  const { data, error } = await db.from("converter_types").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return rowToType(data as Record<string, unknown>);
}

export interface ConvTypeInput {
  slug: string;
  label: string;
  group: ConvGroup;
  description?: string | null;
  accept?: string;
  multiple?: boolean;
  needsFile?: boolean;
  options?: ConvOption[];
  enabled?: boolean;
  sortOrder?: number;
}

function cleanSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createConvType(input: ConvTypeInput) {
  const db = getAdminSupabase();
  const slug = cleanSlug(input.slug);
  if (!slug) throw new Error("Slug is required.");
  if (!input.label.trim()) throw new Error("Label is required.");

  // Append at the end of its group.
  const { data: last } = await db
    .from("converter_types")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = input.sortOrder ?? ((last?.sort_order as number) ?? -1) + 1;

  const { error } = await db.from("converter_types").insert({
    slug,
    label: input.label.trim().slice(0, 80),
    grp: input.group,
    description: input.description?.trim().slice(0, 300) || null,
    accept: (input.accept ?? "").trim().slice(0, 300),
    multiple: !!input.multiple,
    needs_file: input.needsFile !== false,
    options: input.options ?? [],
    enabled: input.enabled !== false,
    sort_order: sortOrder,
  });
  if (error) throw new Error(error.message);
  return slug;
}

export async function updateConvType(id: string, patch: Partial<ConvTypeInput>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.slug !== undefined) {
    const slug = cleanSlug(patch.slug);
    if (!slug) throw new Error("Slug is required.");
    update.slug = slug;
  }
  if (patch.label !== undefined) update.label = patch.label.trim().slice(0, 80);
  if (patch.group !== undefined) update.grp = patch.group;
  if (patch.description !== undefined) update.description = patch.description?.trim().slice(0, 300) || null;
  if (patch.accept !== undefined) update.accept = patch.accept.trim().slice(0, 300);
  if (patch.multiple !== undefined) update.multiple = !!patch.multiple;
  if (patch.needsFile !== undefined) update.needs_file = !!patch.needsFile;
  if (patch.options !== undefined) update.options = patch.options;
  if (patch.enabled !== undefined) update.enabled = !!patch.enabled;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { error } = await db.from("converter_types").update(update).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteConvType(id: string) {
  const db = getAdminSupabase();
  const { error } = await db.from("converter_types").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ── option coercion ────────────────────────────────────────────────────── */

const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

/**
 * Coerce user-supplied options against the admin-defined schema. Anything not
 * declared is dropped, numbers are clamped, selects are restricted. This is
 * what makes the browser's option values safe to sign into an engine ticket.
 */
export function normalizeConvOptions(
  type: ConvType,
  raw: Record<string, unknown> | null | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const opt of type.options) {
    const value = raw?.[opt.id];
    if (opt.type === "select") {
      const allowed = opt.options ?? [];
      const candidate = value === undefined || value === null ? String(opt.value) : String(value);
      out[opt.id] = allowed.includes(candidate) ? candidate : String(opt.value);
      continue;
    }
    if (opt.type === "number") {
      let n = Number(value);
      if (!Number.isFinite(n)) n = Number(opt.value);
      if (opt.min != null) n = Math.max(opt.min, n);
      if (opt.max != null) n = Math.min(opt.max, n);
      out[opt.id] = n;
      continue;
    }
    if (opt.type === "textarea") {
      const s = value === undefined || value === null ? String(opt.value ?? "") : String(value);
      out[opt.id] = s.slice(0, 200_000);
      continue;
    }
    // text
    const s = value === undefined || value === null ? String(opt.value ?? "") : String(value).trim();
    if (opt.id === "start" || opt.id === "duration") {
      if (!s) {
        out[opt.id] = opt.id === "start" ? "00:00:00" : "";
      } else if (TIME_RE.test(s)) {
        out[opt.id] = s;
      } else {
        throw new Error(`${opt.label}: use HH:MM:SS.`);
      }
      continue;
    }
    out[opt.id] = s.slice(0, 200);
  }
  return out;
}

/* ── signed engine upload ticket ────────────────────────────────────────── */

export interface ConvertPayload {
  /** sub-service slug */
  t: string;
  /** normalized options */
  o: Record<string, string | number>;
  /** max upload bytes */
  n: number;
  /** job id chosen by the site, so progress/file tickets match */
  j: string;
}

/**
 * `<exp>.<payloadB64>.<hmac>` — the engine verifies the HMAC over
 * `convert.<payloadB64>.<exp>` with TICKET_SECRET before accepting an upload.
 * Signing the whole payload means the browser cannot swap in a different type,
 * larger file or different options.
 */
export function signConvertPayload(payload: ConvertPayload, ttlMs = 20 * 60 * 1000): string {
  if (!TICKET_SECRET) throw new Error("Converter is not configured (missing ticket secret).");
  const exp = Date.now() + ttlMs;
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = crypto
    .createHmac("sha256", TICKET_SECRET)
    .update(`convert.${payloadB64}.${exp}`)
    .digest("base64url");
  return `${exp}.${payloadB64}.${mac}`;
}

/** Job id the engine will use — 16 hex chars, same shape as engine jobs. */
export function newConvertJobId(): string {
  return crypto.randomBytes(8).toString("hex");
}
