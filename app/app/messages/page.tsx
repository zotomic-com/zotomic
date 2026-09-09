import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { listChannels } from "@/lib/messaging";
import { getPaymentNumbers } from "@/lib/platform-settings";
import {
  getStorefrontAssistantState,
  getStorefrontAssistantTraining,
  SF_CHAT_PACKS,
  utcPeriod,
} from "@/lib/storefront/assistant";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { MessagesClient, type Thread } from "./MessagesClient";
import { StorefrontAssistantPanel, type SfConversation } from "./StorefrontAssistantPanel";
import { AssistantTraining } from "./AssistantTraining";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");
  const businessId = tenant.businessId;
  const storeName = tenant.business?.name ?? "Your store";

  const db = getAdminSupabase();
  const [
    { data: msgs },
    channels,
    assistantState,
    payment,
    { data: sfConvs },
    { data: sfCfgRow },
    { data: pendingTopup },
    { data: usageRow },
    training,
    { data: notedProducts },
  ] = await Promise.all([
    db
      .from("messaging_messages")
      .select("id, provider, direction, thread_key, sender_name, body, read_at, received_at")
      .eq("business_id", businessId)
      .order("received_at", { ascending: true })
      .limit(1000),
    listChannels(businessId),
    getStorefrontAssistantState({ businessId, name: storeName }),
    getPaymentNumbers(),
    db
      .from("storefront_conversations")
      .select("id, visitor_key, channel, title, message_count, last_message_at, created_at, store_accounts(name)")
      .eq("business_id", businessId)
      .order("last_message_at", { ascending: false })
      .limit(40),
    db
      .from("storefront_assistant_config")
      .select("name, greeting, suggested_prompts")
      .eq("business_id", businessId)
      .maybeSingle(),
    db
      .from("storefront_chat_purchases")
      .select("id, conversations, amount, method, txn_id, submitted_at")
      .eq("business_id", businessId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1),
    db
      .from("storefront_assistant_usage")
      .select("messages, blocked")
      .eq("business_id", businessId)
      .eq("period", utcPeriod())
      .maybeSingle(),
    getStorefrontAssistantTraining(businessId),
    db
      .from("products")
      .select("id, name, assistant_note")
      .eq("business_id", businessId)
      .not("assistant_note", "is", null),
  ]);

  const sfConversations: SfConversation[] = (sfConvs ?? []).map((c) => {
    const acct = Array.isArray(c.store_accounts) ? c.store_accounts[0] : c.store_accounts;
    return {
      id: c.id as string,
      who: (acct?.name as string) || (c.channel === "account" ? "Registered shopper" : "Guest"),
      registered: c.channel === "account",
      title: (c.title as string) || "—",
      messages: Number(c.message_count ?? 0),
      lastAt: c.last_message_at as string,
    };
  });

  const connected = channels.filter((c) => c.status === "connected").length;

  const threadMap = new Map<string, Thread>();
  for (const m of msgs ?? []) {
    const key = `${m.provider}:${m.thread_key ?? "unknown"}`;
    let t = threadMap.get(key);
    if (!t) {
      t = {
        key,
        provider: m.provider as string,
        threadKey: (m.thread_key as string) ?? "unknown",
        name: (m.sender_name as string) || (m.thread_key as string) || "Unknown",
        messages: [],
        unread: 0,
        lastAt: m.received_at as string,
      };
      threadMap.set(key, t);
    }
    if (m.sender_name && t.name === t.threadKey) t.name = m.sender_name as string;
    t.messages.push({
      id: m.id as string,
      direction: (m.direction as "in" | "out") ?? "in",
      body: (m.body as string) ?? "",
      at: m.received_at as string,
      read: !!m.read_at,
    });
    if (m.direction !== "out" && !m.read_at) t.unread++;
    t.lastAt = m.received_at as string;
  }

  const threads = [...threadMap.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Messages"
        subtitle="Your storefront assistant, plus Messenger, WhatsApp and Instagram messages."
      />

      <StorefrontAssistantPanel
        state={{
          live: assistantState.live,
          ownerEnabled: assistantState.ownerEnabled,
          suspended: assistantState.suspended,
          suspendedReason: assistantState.suspendedReason,
          plan: assistantState.plan,
          quota: assistantState.quota,
          used: assistantState.used,
          extra: assistantState.extra,
          remaining: assistantState.remaining,
          displayName: assistantState.displayName,
          defaultName: `${storeName} Assistant`,
          messagesThisMonth: Number(usageRow?.messages ?? 0),
          blockedThisMonth: Number(usageRow?.blocked ?? 0),
        }}
        config={{
          name: (sfCfgRow?.name as string) ?? "",
          greeting: (sfCfgRow?.greeting as string) ?? "",
          suggestedPrompts: Array.isArray(sfCfgRow?.suggested_prompts)
            ? (sfCfgRow!.suggested_prompts as string[])
            : [],
        }}
        conversations={sfConversations}
        packs={SF_CHAT_PACKS}
        payment={payment}
        pendingTopup={
          pendingTopup?.[0]
            ? {
                conversations: Number(pendingTopup[0].conversations),
                amount: Number(pendingTopup[0].amount),
                method: pendingTopup[0].method as string,
              }
            : null
        }
      />

      {assistantState.ownerEnabled && (
        <AssistantTraining
          persona={training.persona ?? ""}
          signals={training.signals}
          knowledge={training.knowledge}
          promoted={training.promoted.map((p) => ({ id: p.id, name: p.name }))}
          notedProducts={(notedProducts ?? []).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            note: (p.assistant_note as string) ?? "",
          }))}
        />
      )}

      {threads.length === 0 ? (
        <EmptyState
          title={connected ? "No messages yet" : "No channels connected"}
          description={
            connected
              ? "Messages people send to your connected accounts will appear here."
              : "Connect Messenger, WhatsApp or Instagram from Integrations to start receiving messages."
          }
          action={connected ? undefined : { label: "Go to Integrations", href: "/app/integrations" }}
        />
      ) : (
        <MessagesClient threads={threads} />
      )}
    </div>
  );
}
