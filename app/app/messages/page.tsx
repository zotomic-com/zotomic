import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { listChannels } from "@/lib/messaging";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { MessagesClient, type Thread } from "./MessagesClient";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const db = getAdminSupabase();
  const [{ data: msgs }, channels] = await Promise.all([
    db
      .from("messaging_messages")
      .select("id, provider, direction, thread_key, sender_name, body, read_at, received_at")
      .eq("business_id", tenant.businessId)
      .order("received_at", { ascending: true })
      .limit(1000),
    listChannels(tenant.businessId),
  ]);

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
        subtitle="Facebook Messenger, WhatsApp and Instagram messages sent to your store."
      />

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
