import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { getAdminSupabase } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/ratelimit";
import {
  getStorefrontAssistantState,
  reserveStorefrontConversation,
  bumpUsage,
  utcPeriod,
  SF_VISITOR_LIMITS,
  SF_HISTORY_TURNS,
} from "@/lib/storefront/assistant";
import { runStorefrontBot, storefrontBotConfigured, type SfBotMessage } from "@/lib/agent/storefront-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "zt_sf_chat";

function visitorCookie(req: NextRequest): string | null {
  return req.cookies.get(VISITOR_COOKIE)?.value ?? null;
}

/** Widget bootstrap — what to render before the first message. */
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get("store") ?? "";
  if (!slug) return NextResponse.json({ enabled: false });

  const store = await getStoreBySlug(slug);
  if (!store || !store.published) return NextResponse.json({ enabled: false });

  const state = await getStorefrontAssistantState({ businessId: store.businessId, name: store.name });
  if (!state.live) return NextResponse.json({ enabled: false });

  const account = await getStoreAccount(store.businessId);
  const registered = !!account;

  return NextResponse.json(
    {
      enabled: true,
      // Registered shoppers see it as the Zotomic assistant; guests see the store brand.
      name: registered ? "Zotomic Assistant" : state.displayName,
      greeting: state.greeting,
      prompts: state.suggestedPrompts,
      registered,
      unavailable: state.exhausted,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

interface Body {
  store?: string;
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

  const slug = (body.store ?? "").trim();
  const message = (body.message ?? "").trim().slice(0, 1000);
  if (!slug || !message) return NextResponse.json({ error: "Missing store or message" }, { status: 400 });

  const store = await getStoreBySlug(slug);
  if (!store || !store.published) return NextResponse.json({ error: "Store unavailable" }, { status: 404 });

  if (!storefrontBotConfigured()) {
    return NextResponse.json({ error: "The assistant is not available right now." }, { status: 503 });
  }

  const state = await getStorefrontAssistantState({ businessId: store.businessId, name: store.name });
  if (!state.live) {
    return NextResponse.json({ error: "This store's assistant is turned off." }, { status: 403 });
  }

  const account = await getStoreAccount(store.businessId);

  // Visitor identity — a cookie for guests, the account id for signed-in shoppers.
  let visitorId = visitorCookie(req);
  let setCookie = false;
  if (!visitorId) {
    visitorId = randomUUID();
    setCookie = true;
  }
  const visitorKey = account ? `acct:${account.id}` : `anon:${visitorId}`;

  // Per-visitor abuse guards (burst + hourly).
  const burst = enforceRateLimit(req, {
    name: "sf-assistant-burst",
    key: visitorKey,
    limit: SF_VISITOR_LIMITS.burst.limit,
    windowMs: SF_VISITOR_LIMITS.burst.windowMs,
    message: "You're sending messages very quickly — give it a few seconds.",
  });
  if (burst) return burst;
  const hourly = enforceRateLimit(req, {
    name: "sf-assistant-hourly",
    key: visitorKey,
    limit: SF_VISITOR_LIMITS.hourly.limit,
    windowMs: SF_VISITOR_LIMITS.hourly.windowMs,
    message: "You've reached the message limit for now. Please try again later or contact the store.",
  });
  if (hourly) return hourly;

  const db = getAdminSupabase();
  const basePath = await storeBasePath(slug);

  // Resolve the conversation.
  let conversationId = (body.conversationId ?? "").trim() || null;
  let history: SfBotMessage[] = [];

  if (conversationId) {
    const { data: conv } = await db
      .from("storefront_conversations")
      .select("id, business_id, visitor_key")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv || conv.business_id !== store.businessId || conv.visitor_key !== visitorKey) {
      conversationId = null; // stale / mismatched — start fresh
    } else {
      const { data: msgs } = await db
        .from("storefront_conversation_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(SF_HISTORY_TURNS * 2);
      history = (msgs ?? []).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content as string,
      }));
    }
  }

  if (!conversationId) {
    const ok = await reserveStorefrontConversation(store.businessId);
    if (!ok) {
      return NextResponse.json(
        { error: "The assistant is unavailable for this store right now. Please contact the store directly." },
        { status: 429 },
      );
    }
    const { data: created, error } = await db
      .from("storefront_conversations")
      .insert({
        business_id: store.businessId,
        store_account_id: account?.id ?? null,
        visitor_key: visitorKey,
        channel: account ? "account" : "storefront",
        title: message.slice(0, 80),
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: "Could not start the chat. Try again." }, { status: 500 });
    }
    conversationId = created.id as string;
  }

  // Run the agent.
  const outcome = await runStorefrontBot(
    {
      businessId: store.businessId,
      storeName: store.name,
      assistantName: account ? "Zotomic Assistant" : state.displayName,
      currency: store.currency,
      basePath,
      config: store.config,
      account: account
        ? { id: account.id, customerId: account.customerId, phone: account.phone, name: account.name }
        : null,
      db,
    },
    history,
    message,
  );

  // Persist both turns.
  const msgErr = await db.from("storefront_conversation_messages").insert([
    {
      conversation_id: conversationId,
      business_id: store.businessId,
      role: "user",
      content: message,
      tool_calls: [],
    },
    {
      conversation_id: conversationId,
      business_id: store.businessId,
      role: "assistant",
      content: outcome.reply,
      tool_calls: outcome.traces,
    },
  ]);
  if (msgErr.error) console.error("sf-assistant message insert failed", msgErr.error.message);
  await db
    .from("storefront_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      message_count: history.length + 2,
      store_account_id: account?.id ?? null,
    })
    .eq("id", conversationId);
  await bumpUsage(store.businessId, utcPeriod(), { messages: 1 });

  const res = NextResponse.json({
    conversationId,
    reply: outcome.reply,
    products: outcome.products,
    list: outcome.list,
  });
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
