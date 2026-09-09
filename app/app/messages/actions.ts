"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { getAdminSupabase } from "@/lib/supabase";
import { sfChatPack } from "@/lib/storefront/assistant";
import { normalizeSignals } from "@/lib/storefront/assistant-signals";

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

  const { data: biz } = await db.from("businesses").select("name").eq("id", businessId).maybeSingle();
  await writeAudit(businessId, user.id, "storefront_assistant.topup_submitted", {
    summary: `Submitted ${method} payment for ${pack.conversations} storefront-chat conversations (৳${pack.price}), txn ${txnId}`,
  });

  const { notifyAdmins } = await import("@/lib/notify");
  await notifyAdmins("payment_pending", {
    title: `Storefront-chat top-up to confirm — ${biz?.name ?? "a store"}`,
    body: `${pack.conversations.toLocaleString("en-US")} conversations · ৳${pack.price} · ${method} · txn ${txnId}`,
    href: `/admin/tenants/${businessId}`,
    businessId,
  });

  revalidatePath("/app/messages");
  return { ok: true };
}

/* ─────────────────────  Storefront Assistant — training  ───────────────────── */

export async function saveAssistantTraining(patch: {
  persona?: string;
  signals?: Record<string, boolean>;
  promotedProductIds?: string[];
}): Promise<{ ok: true } | { error: string }> {
  const { businessId, user } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();

  const row: Record<string, unknown> = { business_id: businessId, updated_at: new Date().toISOString() };
  if (patch.persona !== undefined) row.persona = patch.persona.trim().slice(0, 2000) || null;
  if (patch.signals !== undefined) row.signals = normalizeSignals(patch.signals);
  if (patch.promotedProductIds !== undefined) {
    const ids = [...new Set(patch.promotedProductIds.filter((s) => typeof s === "string"))].slice(0, 5);
    // keep only ids this business actually owns
    const { data } = await db.from("products").select("id").eq("business_id", businessId).in("id", ids.length ? ids : ["-"]);
    row.promoted_product_ids = (data ?? []).map((p) => p.id as string);
  }

  const { error } = await db.from("storefront_assistant_config").upsert(row, { onConflict: "business_id" });
  if (error) return { error: "Could not save. Try again." };
  await writeAudit(businessId, user.id, "storefront_assistant.training_updated", {
    summary: "Storefront assistant training updated",
  });
  revalidatePath("/app/messages");
  return { ok: true };
}

export async function addKnowledgeEntry(
  question: string,
  answer: string,
): Promise<{ ok: true } | { error: string }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const q = question.trim().slice(0, 300);
  const a = answer.trim().slice(0, 2000);
  if (q.length < 3 || a.length < 2) return { error: "Add both a question and an answer." };
  const db = getAdminSupabase();
  const { count } = await db
    .from("storefront_assistant_knowledge")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if ((count ?? 0) >= 100) return { error: "You've reached 100 knowledge entries." };
  const { error } = await db
    .from("storefront_assistant_knowledge")
    .insert({ business_id: businessId, question: q, answer: a, sort: count ?? 0 });
  if (error) return { error: "Could not add. Try again." };
  revalidatePath("/app/messages");
  return { ok: true };
}

export async function updateKnowledgeEntry(
  id: string,
  patch: { question?: string; answer?: string; enabled?: boolean },
): Promise<{ ok: true } | { error: string }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.question !== undefined) row.question = patch.question.trim().slice(0, 300);
  if (patch.answer !== undefined) row.answer = patch.answer.trim().slice(0, 2000);
  if (patch.enabled !== undefined) row.enabled = !!patch.enabled;
  const { error } = await db
    .from("storefront_assistant_knowledge")
    .update(row)
    .eq("business_id", businessId)
    .eq("id", id);
  if (error) return { error: "Could not save." };
  revalidatePath("/app/messages");
  return { ok: true };
}

export async function deleteKnowledgeEntry(id: string): Promise<{ ok: true } | { error: string }> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const { error } = await db
    .from("storefront_assistant_knowledge")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id);
  if (error) return { error: "Could not delete." };
  revalidatePath("/app/messages");
  return { ok: true };
}

export async function setProductAssistantNote(
  productId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  const { businessId, user } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  const clean = note.trim().slice(0, 600);
  const { error } = await db
    .from("products")
    .update({ assistant_note: clean || null })
    .eq("business_id", businessId)
    .eq("id", productId);
  if (error) return { error: "Could not save the note." };
  await writeAudit(businessId, user.id, "storefront_assistant.product_note", {
    targetType: "product",
    targetId: productId,
    summary: clean ? "Set assistant talking-points note" : "Cleared assistant note",
  });
  revalidatePath("/app/messages");
  return { ok: true };
}

export async function searchProductsForAssistant(
  query: string,
): Promise<{ id: string; name: string; note: string | null }[]> {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const db = getAdminSupabase();
  let q = db
    .from("products")
    .select("id, name, assistant_note")
    .eq("business_id", businessId)
    .neq("status", "archived")
    .order("name")
    .limit(12);
  const term = query.trim();
  if (term) q = q.ilike("name", `%${term}%`);
  const { data } = await q;
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    note: (p.assistant_note as string) ?? null,
  }));
}
