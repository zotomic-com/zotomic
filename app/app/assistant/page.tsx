import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { geminiConfigured } from "@/lib/ai/gemini";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { AssistantChat } from "./AssistantChat";

export const dynamic = "force-dynamic";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  if (!geminiConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader title="Zotomic Assistant" />
        <EmptyState
          title="Assistant unavailable"
          description="The AI provider isn't configured. Your dashboard and reports work as normal."
          tone="error"
        />
      </div>
    );
  }

  const db = getAdminSupabase();
  const { c } = await searchParams;

  const { data: convs } = await db
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .eq("business_id", tenant.businessId)
    .eq("user_id", tenant.user.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  const conversations = (convs ?? []).map((x) => ({
    id: x.id as string,
    title: (x.title as string) || "Conversation",
    updatedAt: x.updated_at as string,
  }));

  const activeId =
    c === "new" ? null : c && conversations.some((x) => x.id === c) ? c : conversations[0]?.id ?? null;

  let initialMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (activeId) {
    const { data: msgs } = await db
      .from("assistant_messages")
      .select("role, content")
      .eq("conversation_id", activeId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(60);
    initialMessages = (msgs ?? [])
      .filter((m) => m.content)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content as string }));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Zotomic Assistant"
        subtitle="Ask about your metrics, reports, products, orders and customers."
      />
      <Suspense fallback={null}>
        <AssistantChat
          key={activeId ?? "new"}
          initialConversationId={activeId}
          initialMessages={initialMessages}
          conversations={conversations}
          readOnly={tenant.billing.readOnly}
        />
      </Suspense>
    </div>
  );
}
