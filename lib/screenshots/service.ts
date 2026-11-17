/**
 * Screenshot Organizer — service layer (server-only).
 *
 * Sessions → groups → items. Ownership: sessions belong to a signed-in user
 * (owner_email) or, for guests, to the calling IP (owner_ip). All access goes
 * through this layer — Hermes tools and API routes both call these functions;
 * nothing touches the tables directly.
 *
 * Retention: sessions expire after 24h; expired rows are purged lazily on
 * every list/create. Only small thumbnails + extracted text are stored — the
 * original images never leave the user's device.
 */
import "server-only";
import type { PostgrestFilterBuilder } from "@supabase/supabase-js";
import { getAdminSupabase } from "@/lib/supabase";
import { analyzeScreenshot, recoverScreenshotLinks, type ScreenshotAnalysis, type RecoveredLink, type LinkVerdict } from "@/lib/screenshots/analysis";

export const SESSION_TTL_HOURS = 24;

const MAX_GROUPS_PER_SESSION = 24;
const MAX_ITEMS_PER_SESSION = 250;

export interface ScreenshotSessionRow {
  id: string;
  owner_email: string | null;
  owner_ip: string | null;
  title: string;
  created_at: string;
  expires_at: string;
}

export interface ScreenshotGroupRow {
  id: string;
  session_id: string;
  name: string;
  sort_order: number;
}

export interface ScreenshotItemRow {
  id: string;
  session_id: string;
  group_id: string | null;
  name: string;
  details: string;
  user_link: string;
  thumb: string;
  analysis: ScreenshotAnalysis;
  recovered_links: RecoveredLink[];
  status: "pending" | "ready" | "error";
  error: string | null;
  created_at: string;
}

export class ScreenshotServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const db = () => getAdminSupabase();

/* ── ownership ───────────────────────────────────────────────────────────── */

type SessionQuery = PostgrestFilterBuilder<any, any, any, any>;

function ownerFilter(query: SessionQuery, email: string | null, ip: string | null): SessionQuery {
  if (email) return query.eq("owner_email", email);
  return query.eq("owner_ip", ip ?? "").is("owner_email", null);
}

export async function ownSession(sessionId: string, email: string | null, ip: string | null): Promise<ScreenshotSessionRow> {  const { data, error } = await ownerFilter(
    db().from("screenshot_sessions").select("*").eq("id", sessionId),
    email,
    ip,
  ).maybeSingle();
  if (error || !data) throw new ScreenshotServiceError("Session not found (or not yours).", 404);
  return data as ScreenshotSessionRow;
}

/* ── retention ───────────────────────────────────────────────────────────── */

async function purgeExpired(): Promise<void> {
  try {
    await db().from("screenshot_sessions").delete().lt("expires_at", new Date().toISOString());
  } catch {
    // never break the user's request over cleanup
  }
}

/* ── sessions ────────────────────────────────────────────────────────────── */

export async function createSession(
  email: string | null,
  ip: string | null,
  title = "Screenshots",
): Promise<ScreenshotSessionRow> {
  await purgeExpired();
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();
  const { data, error } = await db()
    .from("screenshot_sessions")
    .insert({ owner_email: email, owner_ip: email ? null : ip, title: title.slice(0, 80), expires_at: expires })
    .select("*")
    .single();
  if (error || !data) throw new ScreenshotServiceError("Could not create a session.", 500);
  return data as ScreenshotSessionRow;
}

export async function listSessions(email: string | null, ip: string | null): Promise<ScreenshotSessionRow[]> {
  await purgeExpired();
  const { data, error } = await ownerFilter(
    db().from("screenshot_sessions").select("*").order("created_at", { ascending: false }).limit(20),
    email,
    ip,
  );
  if (error) throw new ScreenshotServiceError("Could not list sessions.", 500);
  return (data ?? []) as ScreenshotSessionRow[];
}

/* ── groups ──────────────────────────────────────────────────────────────── */

export async function listGroups(sessionId: string): Promise<ScreenshotGroupRow[]> {
  const { data, error } = await db()
    .from("screenshot_groups")
    .select("*")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });
  if (error) throw new ScreenshotServiceError("Could not list groups.", 500);
  return (data ?? []) as ScreenshotGroupRow[];
}

/** Get an existing group or create it (case-preserving, case-insensitive). */
export async function ensureGroup(sessionId: string, name: string): Promise<ScreenshotGroupRow> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new ScreenshotServiceError("Group name is empty.");
  const { data: existing } = await db()
    .from("screenshot_groups")
    .select("*")
    .eq("session_id", sessionId)
    .ilike("name", clean)
    .maybeSingle();
  if (existing) return existing as ScreenshotGroupRow;
  const { count } = await db()
    .from("screenshot_groups")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if ((count ?? 0) >= MAX_GROUPS_PER_SESSION) {
    throw new ScreenshotServiceError(`This session already has ${MAX_GROUPS_PER_SESSION} groups — merge some first.`, 400);
  }
  const { data, error } = await db()
    .from("screenshot_groups")
    .insert({ session_id: sessionId, name: clean, sort_order: count ?? 0 })
    .select("*")
    .single();
  if (error || !data) throw new ScreenshotServiceError("Could not create the group.", 500);
  return data as ScreenshotGroupRow;
}

export async function renameGroup(sessionId: string, groupId: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new ScreenshotServiceError("Group name is empty.");
  const { error } = await db()
    .from("screenshot_groups")
    .update({ name: clean })
    .eq("id", groupId)
    .eq("session_id", sessionId);
  if (error) throw new ScreenshotServiceError("Could not rename the group.", 500);
}

export async function deleteGroup(sessionId: string, groupId: string): Promise<void> {
  const { error } = await db().from("screenshot_groups").delete().eq("id", groupId).eq("session_id", sessionId);
  if (error) throw new ScreenshotServiceError("Could not delete the group.", 500);
}

/* ── items ───────────────────────────────────────────────────────────────── */

async function countItems(sessionId: string): Promise<number> {
  const { count } = await db()
    .from("screenshot_items")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  return count ?? 0;
}

export interface AddItemInput {
  sessionId: string;
  name: string;
  groupId: string | null;
  details?: string;
  userLink?: string;
  thumb?: string;
  imageBase64?: string; // downscaled JPEG, no data: prefix — analysed then discarded
  mimeType?: string;
}

export async function addItem(
  email: string | null,
  ip: string | null,
  input: AddItemInput,
): Promise<ScreenshotItemRow> {
  const session = await ownSession(input.sessionId, email, ip);
  if ((await countItems(session.id)) >= MAX_ITEMS_PER_SESSION) {
    throw new ScreenshotServiceError(`This session is full (${MAX_ITEMS_PER_SESSION} screenshots). Start a new session.`, 400);
  }

  const analysis = input.imageBase64
    ? await analyzeScreenshot({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType || "image/jpeg",
        name: input.name,
        userHint: [input.details, input.userLink].filter(Boolean).join(" "),
      })
    : null;

  const { data, error } = await db()
    .from("screenshot_items")
    .insert({
      session_id: session.id,
      group_id: input.groupId,
      name: input.name.slice(0, 120) || "Screenshot",
      details: (input.details ?? "").slice(0, 2000),
      user_link: (input.userLink ?? "").slice(0, 500),
      thumb: (input.thumb ?? "").slice(0, 80_000),
      analysis: analysis ?? {},
      recovered_links: [],
      status: analysis ? (analysis.error ? "error" : "ready") : "ready",
      error: analysis?.error ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new ScreenshotServiceError("Could not save the screenshot.", 500);
  return data as ScreenshotItemRow;
}

export async function getItem(sessionId: string, itemId: string): Promise<ScreenshotItemRow> {
  const { data, error } = await db()
    .from("screenshot_items")
    .select("*")
    .eq("id", itemId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error || !data) throw new ScreenshotServiceError("Screenshot not found (or not in this session).", 404);
  return data as ScreenshotItemRow;
}

export async function listItems(sessionId: string): Promise<ScreenshotItemRow[]> {
  const { data, error } = await db()
    .from("screenshot_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new ScreenshotServiceError("Could not list screenshots.", 500);
  return (data ?? []) as ScreenshotItemRow[];
}

export interface UpdateItemPatch {
  name?: string;
  groupId?: string | null;
  details?: string;
  userLink?: string;
}

export async function updateItem(sessionId: string, itemId: string, patch: UpdateItemPatch): Promise<ScreenshotItemRow> {
  const u: Record<string, unknown> = {};
  if (patch.name !== undefined) u.name = patch.name.trim().slice(0, 120) || "Screenshot";
  if (patch.groupId !== undefined) u.group_id = patch.groupId;
  if (patch.details !== undefined) u.details = patch.details.slice(0, 2000);
  if (patch.userLink !== undefined) u.user_link = patch.userLink.slice(0, 500);
  if (!Object.keys(u).length) return getItem(sessionId, itemId);
  const { data, error } = await db()
    .from("screenshot_items")
    .update(u)
    .eq("id", itemId)
    .eq("session_id", sessionId)
    .select("*")
    .single();
  if (error || !data) throw new ScreenshotServiceError("Could not update the screenshot.", 404);
  return data as ScreenshotItemRow;
}

export async function deleteItem(sessionId: string, itemId: string): Promise<void> {
  const { error } = await db().from("screenshot_items").delete().eq("id", itemId).eq("session_id", sessionId);
  if (error) throw new ScreenshotServiceError("Could not delete the screenshot.", 500);
}

/* ── link recovery (owned by the analysis module; writes back here) ──────── */

export async function recoverLinks(sessionId: string, itemId: string): Promise<{ item: ScreenshotItemRow; links: RecoveredLink[] }> {
  const item = await getItem(sessionId, itemId);
  const analysis = (item.analysis ?? {}) as ScreenshotAnalysis;
  const links = await recoverScreenshotLinks({ analysis, userLink: item.user_link });
  const { data, error } = await db()
    .from("screenshot_items")
    .update({ recovered_links: links })
    .eq("id", item.id)
    .eq("session_id", sessionId)
    .select("*")
    .single();
  if (error || !data) throw new ScreenshotServiceError("Could not save recovered links.", 500);
  return { item: data as ScreenshotItemRow, links };
}

/* ── text exports ────────────────────────────────────────────────────────── */

function groupNameOf(item: ScreenshotItemRow, groups: ScreenshotGroupRow[]): string {
  return groups.find((g) => g.id === item.group_id)?.name ?? "Ungrouped";
}

export function buildLinksText(session: ScreenshotSessionRow, items: ScreenshotItemRow[], groups: ScreenshotGroupRow[]): string {
  const byGroup = new Map<string, ScreenshotItemRow[]>();
  for (const it of items) {
    const g = groupNameOf(it, groups);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(it);
  }
  const lines: string[] = [
    `Zotomic Screenshot Organizer — links`,
    `Session: ${session.title}`,
    `Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    ``,
  ];
  for (const [g, its] of byGroup) {
    lines.push(`== ${g} ==`);
    for (const it of its) {
      const a = (it.analysis ?? {}) as ScreenshotAnalysis;
      const all = [
        ...(it.user_link ? [{ url: it.user_link, verdict: "verified" as LinkVerdict, details: "link you provided" }] : []),
        ...(it.recovered_links ?? []),
      ];
      lines.push(`${it.name}${a.key_info ? ` — ${a.key_info}` : ""}`);
      if (all.length) {
        for (const l of all) {
          const prefix = l.verdict === "verified" ? "✅" : l.verdict === "probable" ? "🔎" : "💡";
          lines.push(`  ${prefix} ${l.verdict === "suggestion" ? `Try searching: ${l.details || l.url}` : `${l.url} — ${l.details || l.verdict}`}`);
        }
      } else {
        lines.push(`  (no links found)`);
      }
      if (a.why) lines.push(`  Why: ${a.why}`);
      lines.push(``);
    }
  }
  return lines.join("\n");
}

export function buildNotesText(session: ScreenshotSessionRow, items: ScreenshotItemRow[], groups: ScreenshotGroupRow[]): string {
  const lines: string[] = [
    `Zotomic Screenshot Organizer — notes`,
    `Session: ${session.title}`,
    `Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    ``,
  ];
  for (const it of items) {
    const a = (it.analysis ?? {}) as ScreenshotAnalysis;
    lines.push(`■ ${it.name}  [${groupNameOf(it, groups)}]`);
    if (a.title && a.title !== it.name) lines.push(`  On screen: ${a.title}`);
    if (a.key_info) lines.push(`  Key info: ${a.key_info}`);
    if (it.details) lines.push(`  My note: ${it.details}`);
    if (a.text) lines.push(`  Text: ${a.text.slice(0, 600)}`);
    if (a.tags?.length) lines.push(`  Tags: ${a.tags.join(", ")}`);
    if (a.sensitive) lines.push(`  ⚠ May contain sensitive information`);
    lines.push(``);
  }
  return lines.join("\n");
}
