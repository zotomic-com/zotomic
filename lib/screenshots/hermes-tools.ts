/**
 * Screenshot Organizer tools for Hermes.
 *
 * Hermes never touches the screenshot tables directly — everything goes
 * through the service layer in ./service, scoped to the signed-in owner's
 * own sessions (owner_email). Imported and exported from lib/tools/registry.
 */
import "server-only";
import type { ToolDef, ToolContext } from "@/lib/tools/types";
import {
  listSessions,
  listGroups,
  listItems,
  getItem,
  updateItem,
  deleteItem,
  recoverLinks,
  ensureGroup,
  buildLinksText,
} from "./service";
import type { ScreenshotItemRow } from "./service";

/** The owner's email — screenshot sessions are owned by platform users. */
async function ownerEmail(ctx: ToolContext): Promise<string | null> {
  const { data } = await ctx.db.from("users").select("email").eq("id", ctx.userId).maybeSingle();
  return (data?.email as string) ?? null;
}

function itemBrief(it: ScreenshotItemRow) {
  const a = (it.analysis ?? {}) as Record<string, unknown>;
  return {
    id: it.id,
    name: it.name,
    key_info: a.key_info ?? "",
    category: a.category ?? "",
    source_app: a.source_app ?? "",
    why: a.why ?? "",
    user_link: it.user_link || undefined,
    visible_links: (a.links as string[] | undefined)?.slice(0, 3),
    recovered_links: (it.recovered_links ?? []).map((l) => `${l.verdict}: ${l.url}`).slice(0, 4),
    sensitive: !!a.sensitive,
    details: it.details || undefined,
  };
}

export const SCREENSHOT_TOOLS: ToolDef[] = [
  {
    name: "screenshot_list_sessions",
    description:
      "The owner's Screenshot Organizer sessions (last 24h) — id, title, created. Use this first when the owner asks about their organized screenshots.",
    risk: "read",
    creditCost: 0,
    parameters: { type: "object", properties: {} },
    async handler(ctx) {
      const email = await ownerEmail(ctx);
      if (!email) return { error: "This account has no email to own screenshot sessions." };
      const rows = await listSessions(email, null);
      return rows.length
        ? { sessions: rows.map((s) => ({ id: s.id, title: s.title, created_at: s.created_at, expires_at: s.expires_at })) }
        : { note: "No screenshot sessions in the last 24 hours." };
    },
  },
  {
    name: "screenshot_list_items",
    description:
      "List the owner's organized screenshots (with their extracted info and links). Filter by session id, group name, or a free-text search over names/notes/extracted text/tags.",
    risk: "read",
    creditCost: 0,
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Optional session id; defaults to the most recent session." },
        group_name: { type: "string", description: "Optional: only items in this group." },
        query: { type: "string", description: "Optional free-text search." },
        limit: { type: "integer", description: "Optional: max items to return (default 25)." },
      },
    },
    async handler(ctx, args) {
      const email = await ownerEmail(ctx);
      if (!email) return { error: "This account has no email to own screenshot sessions." };
      const sessions = await listSessions(email, null);
      if (!sessions.length) return { note: "No screenshot sessions in the last 24 hours." };
      const sessionId = (typeof args.session_id === "string" ? args.session_id : "") || sessions[0].id;
      const [groups, items] = await Promise.all([listGroups(sessionId), listItems(sessionId)]);
      let filtered = items;
      const gn = typeof args.group_name === "string" ? args.group_name.toLowerCase() : "";
      if (gn) filtered = filtered.filter((it) => groups.find((g) => g.id === it.group_id)?.name.toLowerCase() === gn);
      const q = typeof args.query === "string" ? args.query.toLowerCase() : "";
      if (q) {
        filtered = filtered.filter((it) => {
          const a = (it.analysis ?? {}) as Record<string, unknown>;
          return [it.name, it.details, String(a.key_info ?? ""), String(a.text ?? ""), String(a.title ?? ""), (a.tags as string[] | undefined)?.join(" ") ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q);
        });
      }
      const lim = typeof args.limit === "number" ? args.limit : 25;
      return {
        session_id: sessionId,
        groups: groups.map((g) => g.name),
        items: filtered.slice(0, lim).map(itemBrief),
        total: filtered.length,
      };
    },
  },
  {
    name: "screenshot_get_item",
    description: "Full details of one organized screenshot: all extracted text, every link and the owner's note.",
    risk: "read",
    creditCost: 0,
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "The session the item is in (defaults to the most recent session)." },
        item_id: { type: "string", description: "The screenshot's id (from screenshot_list_items)." },
      },
      required: ["item_id"],
    },
    async handler(ctx, args) {
      const email = await ownerEmail(ctx);
      if (!email) return { error: "This account has no email to own screenshot sessions." };
      const sessions = await listSessions(email, null);
      const sessionId = (typeof args.session_id === "string" ? args.session_id : "") || sessions[0]?.id;
      if (!sessionId) return { note: "No screenshot sessions in the last 24 hours." };
      const it = await getItem(sessionId, String(args.item_id));
      const a = (it.analysis ?? {}) as Record<string, unknown>;
      return { ...itemBrief(it), full_text: a.text, all_links: it.recovered_links, group: "" };
    },
  },
  {
    name: "screenshot_update_item",
    description:
      "Rename a screenshot, move it to another group, or edit its details/link. Only edits what is passed.",
    risk: "write",
    creditCost: 1,
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Defaults to the most recent session." },
        item_id: { type: "string" },
        name: { type: "string", description: "New display name." },
        group_name: { type: "string", description: "Move the item into this group (created if missing)." },
        details: { type: "string", description: "Replace the owner's note." },
        link: { type: "string", description: "Replace the owner-provided link." },
      },
      required: ["item_id"],
    },
    async handler(ctx, args) {
      const email = await ownerEmail(ctx);
      if (!email) return { error: "This account has no email to own screenshot sessions." };
      const sessions = await listSessions(email, null);
      const sessionId = (typeof args.session_id === "string" ? args.session_id : "") || sessions[0]?.id;
      if (!sessionId) return { note: "No screenshot sessions in the last 24 hours." };
      let groupId: string | undefined;
      if (typeof args.group_name === "string" && args.group_name) {
        const g = await ensureGroup(sessionId, args.group_name);
        groupId = g.id;
      }
      const updated = await updateItem(sessionId, String(args.item_id), {
        name: typeof args.name === "string" ? args.name : undefined,
        groupId,
        details: typeof args.details === "string" ? args.details : undefined,
        userLink: typeof args.link === "string" ? args.link : undefined,
      });
      return { updated: itemBrief(updated) };
    },
  },
  {
    name: "screenshot_delete_item",
    description:
      "Permanently delete one organized screenshot (the stored thumbnail + extracted text). The original image on the owner's device is untouched.",
    risk: "consequential",
    creditCost: 2,
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Defaults to the most recent session." },
        item_id: { type: "string" },
      },
      required: ["item_id"],
    },
    async handler(ctx, args) {
      const email = await ownerEmail(ctx);
      if (!email) return { error: "This account has no email to own screenshot sessions." };
      const sessions = await listSessions(email, null);
      const sessionId = (typeof args.session_id === "string" ? args.session_id : "") || sessions[0]?.id;
      if (!sessionId) return { note: "No screenshot sessions in the last 24 hours." };
      await deleteItem(sessionId, String(args.item_id));
      return { deleted: String(args.item_id) };
    },
  },
  {
    name: "screenshot_recover_links",
    description:
      "Run link recovery on one screenshot that shows no URL (GitHub repo names, product names, video titles…) — verifies candidate URLs before calling them links.",
    risk: "write",
    creditCost: 1,
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Defaults to the most recent session." },
        item_id: { type: "string" },
      },
      required: ["item_id"],
    },
    async handler(ctx, args) {
      const email = await ownerEmail(ctx);
      if (!email) return { error: "This account has no email to own screenshot sessions." };
      const sessions = await listSessions(email, null);
      const sessionId = (typeof args.session_id === "string" ? args.session_id : "") || sessions[0]?.id;
      if (!sessionId) return { note: "No screenshot sessions in the last 24 hours." };
      const { links } = await recoverLinks(sessionId, String(args.item_id));
      return links.length
        ? { links: links.map((l) => ({ url: l.url, verdict: l.verdict, details: l.details })) }
        : { note: "No links could be recovered for this screenshot." };
    },
  },
  {
    name: "screenshot_export_links",
    description:
      "The owner's links.txt content for a session (or just one group of it) — every link, why each screenshot was taken.",
    risk: "read",
    creditCost: 0,
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Defaults to the most recent session." },
        group_name: { type: "string", description: "Optional: only this group." },
      },
    },
    async handler(ctx, args) {
      const email = await ownerEmail(ctx);
      if (!email) return { error: "This account has no email to own screenshot sessions." };
      const sessions = await listSessions(email, null);
      const sessionId = (typeof args.session_id === "string" ? args.session_id : "") || sessions[0]?.id;
      if (!sessionId) return { note: "No screenshot sessions in the last 24 hours." };
      const session = sessions.find((s) => s.id === sessionId)!;
      const [groups, items] = await Promise.all([listGroups(sessionId), listItems(sessionId)]);
      let filtered = items;
      const gn = typeof args.group_name === "string" ? args.group_name.toLowerCase() : "";
      if (gn) filtered = filtered.filter((it) => groups.find((g) => g.id === it.group_id)?.name.toLowerCase() === gn);
      const text = buildLinksText(session, filtered, groups);
      return text ? { links_text: text } : { note: "Nothing to export." };
    },
  },
];
