import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAdminSupabase } from "@/lib/supabase";
import { getLiveSessionUser } from "@/lib/tenant-server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { runFrontDeskBot, frontDeskBotConfigured, type FdBotMessage } from "@/lib/agent/front-desk-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "zt_fd_chat";
const HISTORY_TURNS = 12;
const BURST = { limit: 4, windowMs: 20_000 };
const DAILY = { limit: 40, windowMs: 24 * 60 * 60_000 };

function visitorCookie(req: NextRequest): string | null {
  return req.cookies.get(VISITOR_COOKIE)?.value ?? null;
}

/** Widget bootstrap — what to render before the first message. */
export async function GET() {
  const user = await getLiveSessionUser();
  return NextResponse.json(
    {
      enabled: frontDeskBotConfigured(),
      name: "Front Desk",
      greeting: "Hi! I can help you find a domain name, plan a web design/development project, explain our services, or check your orders.",
      prompts: ["I need a website built", "Suggest a domain name", "What services do you offer?", "Check my orders"],
      loggedIn: !!user,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

interface Body {
  conversationId?: string;
  message?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const message = (body.message ?? "").trim().slice(0, 1000);
  if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });

  if (!frontDeskBotConfigured()) {
    return NextResponse.json({ error: "The assistant is not available right now." }, { status: 503 });
  }

  const user = await getLiveSessionUser();

  let visitorId = visitorCookie(req);
  let setCookie = false;
  if (!visitorId) {
    visitorId = randomUUID();
    setCookie = true;
  }
  const visitorKey = user ? `user:${user.id}` : `anon:${visitorId}`;

  const burst = enforceRateLimit(req, { name: "fd-assistant-burst", key: visitorKey, limit: BURST.limit, windowMs: BURST.windowMs, message: "You're sending messages very quickly — give it a few seconds." });
  if (burst) return burst;
  const daily = enforceRateLimit(req, { name: "fd-assistant-daily", key: visitorKey, limit: DAILY.limit, windowMs: DAILY.windowMs, message: "You've reached today's message limit. Please try again tomorrow." });
  if (daily) return daily;

  const db = getAdminSupabase();

  let conversationId = (body.conversationId ?? "").trim() || null;
  let history: FdBotMessage[] = [];

  if (conversationId) {
    const { data: conv } = await db.from("front_desk_conversations").select("id, visitor_key").eq("id", conversationId).maybeSingle();
    if (!conv || conv.visitor_key !== visitorKey) {
      conversationId = null;
    } else {
      const { data: msgs } = await db
        .from("front_desk_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(HISTORY_TURNS * 2);
      history = (msgs ?? []).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content as string }));
    }
  }

  if (!conversationId) {
    const { data: created, error } = await db
      .from("front_desk_conversations")
      .insert({ visitor_key: visitorKey, user_id: user?.id ?? null })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: "Could not start the chat. Try again." }, { status: 500 });
    conversationId = created.id as string;
  }

  const outcome = await runFrontDeskBot({ userId: user?.id ?? null }, history, message);

  const msgErr = await db.from("front_desk_messages").insert([
    { conversation_id: conversationId, role: "user", content: message },
    { conversation_id: conversationId, role: "assistant", content: outcome.reply },
  ]);
  if (msgErr.error) console.error("front-desk message insert failed", msgErr.error.message);
  await db
    .from("front_desk_conversations")
    .update({ last_message_at: new Date().toISOString(), message_count: history.length + 2, user_id: user?.id ?? null })
    .eq("id", conversationId);

  const res = NextResponse.json({ conversationId, reply: outcome.reply });
  if (setCookie) {
    res.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return res;
}
