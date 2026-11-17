/**
 * /api/services/tools/screenshots/session/[sessionId]
 *
 * GET    → the session (ownership-checked) with groups + items + text exports
 * PATCH  → { action: "renameGroup" | "addGroup", groupId?, name? }
 * DELETE → ?itemId=… (one screenshot) | ?groupId=… (a group) | (nothing = whole session)
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveToolCaller } from "@/lib/services/tools";
import {
  ScreenshotServiceError,
  ownSession,
  listGroups,
  listItems,
  ensureGroup,
  renameGroup,
  deleteGroup,
  updateItem,
  deleteItem,
  buildLinksText,
  buildNotesText,
} from "@/lib/screenshots/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ sessionId: string }> };

async function guard(req: NextRequest, sessionId: string) {
  const res = await resolveToolCaller(req, "screenshot_organizer");
  if (!res.caller) return { error: res.error, status: res.status ?? 401 } as const;
  const session = await ownSession(sessionId, res.caller.email, res.caller.ip);
  return { caller: res.caller, session } as const;
}

function fail(e: unknown) {
  const status = e instanceof ScreenshotServiceError ? e.status : 500;
  return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { sessionId } = await ctx.params;
  try {
    const g = await guard(req, sessionId);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const [groups, items] = await Promise.all([listGroups(sessionId), listItems(sessionId)]);
    return NextResponse.json({
      session: g.session,
      groups,
      items,
      linksText: buildLinksText(g.session, items, groups),
      notesText: buildNotesText(g.session, items, groups),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { sessionId } = await ctx.params;
  try {
    const g = await guard(req, sessionId);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const body = (await req.json()) as { action?: string; groupId?: string; name?: string };
    if (body.action === "addGroup" && body.name) {
      const group = await ensureGroup(sessionId, body.name);
      return NextResponse.json({ group });
    }
    if (body.action === "renameGroup" && body.groupId && body.name) {
      await renameGroup(sessionId, body.groupId, body.name);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action or missing fields." }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { sessionId } = await ctx.params;
  try {
    const g = await guard(req, sessionId);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const itemId = req.nextUrl.searchParams.get("itemId");
    const groupId = req.nextUrl.searchParams.get("groupId");
    if (itemId) {
      await deleteItem(sessionId, itemId);
      return NextResponse.json({ ok: true, deleted: "item" });
    }
    if (groupId) {
      await deleteGroup(sessionId, groupId);
      return NextResponse.json({ ok: true, deleted: "group" });
    }
    const { getAdminSupabase } = await import("@/lib/supabase");
    await getAdminSupabase().from("screenshot_sessions").delete().eq("id", sessionId);
    return NextResponse.json({ ok: true, deleted: "session" });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  // item updates ride on POST so Hermes-style edits stay simple
  const { sessionId } = await ctx.params;
  try {
    const g = await guard(req, sessionId);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const body = (await req.json()) as {
      itemId?: string;
      name?: string;
      groupId?: string | null;
      details?: string;
      link?: string;
    };
    if (!body.itemId) return NextResponse.json({ error: "itemId is required." }, { status: 400 });
    const item = await updateItem(sessionId, body.itemId, {
      name: body.name,
      groupId: body.groupId,
      details: body.details,
      userLink: body.link,
    });
    return NextResponse.json({ item });
  } catch (e) {
    return fail(e);
  }
}
