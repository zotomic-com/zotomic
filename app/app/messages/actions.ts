"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { getAdminSupabase } from "@/lib/supabase";
import { sfChatPack } from "@/lib/storefront/assistant";

export async function markThreadRead(provider: string, threadKey: string) {
  const { businessId, db } = await requireBusiness({ allowReadOnly: true });
  await db
    .from("messaging_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("provider", provider)
    .eq("thread_key", threadKey)
    .is("read_at", null);
  revalidatePath("/app/messages");
  return { ok: true };
}

/* ───────────────────────────  Storefront Assistant  ─────────────────────────── */

interface AssistantPatch {
  enabled?: boolean;
  name?: string;
  greeting?: string;
  suggestedPrompts?: string[];
}

export async function saveStorefrontAssistant(
  patch: AssistantPatch,
): Promise<{ ok: true } | { error: string }> {
  const { businessId, user } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();

  const row: Record<string, unknown> = { business_id: businessId, updated_at: new Date().toISOString() };
  if (patch.enabled !== undefined) row.enabled = !!patch.enabled;
  if (patch.name !== undefined) row.name = patch.name.trim().slice(0, 60) || null;
  if (patch.greeting !== undefined) row.greeting = patch.greeting.trim().slice(0, 400) || null;
  if (patch.suggestedPrompts !== undefined) {
    row.suggested_prompts = patch.suggestedPrompts
      .map((s) => s.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 6);
  }

  const { error } = await db
    .from("storefront_assistant_config")
    .upsert(row, { onConflict: "business_id" });
  if (error) return { error: "Could not save. Try again." };

  await writeAudit(businessId, user.id, "storefront_assistant.updated", {
    summary:
      patch.enabled !== undefined
        ? `Storefront assistant ${patch.enabled ? "enabled" : "disabled"}`
        : "Storefront assistant settings updated",
  });
  revalidatePath("/app/messages");
  return { ok: true };
}

/** "Delete" = turn it off and clear the custom name / greeting / prompts. */
export async function resetStorefrontAssistant(): Promise<{ ok: true } | { error: string }> {
  const { businessId, user } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const { error } = await db.from("storefront_assistant_config").upsert(
    {
      business_id: businessId,
      enabled: false,
      name: null,
      greeting: null,
      suggested_prompts: [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  );
  if (error) return { error: "Could not reset. Try again." };
  await writeAudit(businessId, user.id, "storefront_assistant.reset", {
    summary: "Storefront assistant reset and disabled",
  });
  revalidatePath("/app/messages");
  return { ok: true };
}

export async function loadStorefrontConversation(
  id: string,
): Promise<{ error: string } | { ok: true; messages: { role: string; content: string; at: string }[] }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const { data: conv } = await db
    .from("storefront_conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (!conv) return { error: "Not found." };
  const { data: msgs } = await db
    .from("storefront_conversation_messages")
    .select("role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);
  return {
    ok: true,
    messages: (msgs ?? []).map((m) => ({
      role: m.role as string,
      content: m.content as string,
      at: m.created_at as string,
    })),
  };
}

export async function deleteStorefrontConversation(id: string): Promise<{ ok: true } | { error: string }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const { error } = await db
    .from("storefront_conversations")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id);
  if (error) return { error: "Could not delete." };
  revalidatePath("/app/messages");
  return { ok: true };
}

export async function submitStorefrontChatTopup(
  form: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { businessId, user } = await requireBusiness({ allowReadOnly: true });
  const packId = String(form.get("pack") ?? "");
  const method = String(form.get("method") ?? "");
  const txnId = String(form.get("txn_id") ?? "").trim().slice(0, 64);

  const pack = sfChatPack(packId);
  if (!pack) return { error: "Pick a pack." };
  if (method !== "bkash" && method !== "nagad") return { error: "Choose bKash or Nagad." };
  if (txnId.length < 4) return { error: "Enter the transaction ID from your payment." };

  const db = getAdminSupabase();
  const { data: dupe } = await db
    .from("storefront_chat_purchases")
    .select("id")
    .eq("business_id", businessId)
    .eq("txn_id", txnId)
    .maybeSingle();
  if (dupe) return { error: "That transaction ID has already been submitted." };

  const { error } = await db.from("storefront_chat_purchases").insert({
    business_id: businessId,
    pack_id: pack.id,
    conversations: pack.conversations,
    amount: pack.price,
    currency: "BDT",
    method,
    txn_id: txnId,
    submitted_by: user.id,
  });
  if (error) return { error: "Could not submit — try again." };

  const { data: admins } = await db.from("users").select("id").eq("role", "admin");
  const { data: biz } = await db.from("businesses").select("name").eq("id", businessId).maybeSingle();
  if (admins?.length) {
    await db.from("notifications").insert(
      admins.map((a) => ({
        business_id: businessId,
        user_id: a.id as string,
        type: "sf_chat_topup",
        title: `Storefront chat top-up to confirm — ${biz?.name ?? "a store"}`,
        body: `${pack.conversations.toLocaleString("en-US")} conversations · ৳${pack.price} · ${method} · txn ${txnId}`,
        href: `/admin/tenants/${businessId}`,
      })),
    );
  }
  await writeAudit(businessId, user.id, "storefront_assistant.topup_submitted", {
    summary: `Submitted ${method} payment for ${pack.conversations} storefront-chat conversations (৳${pack.price}), txn ${txnId}`,
  });
  revalidatePath("/app/messages");
  return { ok: true };
}
