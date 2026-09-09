/**
 * Demand signals mined from the storefront assistant's chats for the week.
 *
 * Shoppers tell the assistant exactly what they want ("a red Classic T-Shirt",
 * "this hoodie in M", "do you have it cheaper") — that intent is gold for the
 * Weekly Report, especially the *unmet* demand (asked for something the store
 * doesn't stock or that's out of stock). One Gemini call per report, gated by
 * the same AI budget as the narrative.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { geminiGenerate, geminiConfigured, parseJsonResponse } from "@/lib/ai/gemini";
import type { Observation } from "@/lib/observations";

interface DemandTheme {
  topic: string;
  mentions: number;
  unmet?: boolean;
}
interface DemandExtract {
  themes: DemandTheme[];
  summary: string;
}

const SYSTEM = `You analyse a week of chat messages that shoppers sent to an online store's shopping assistant.
Extract what shoppers were actually after. Group similar asks together.
Mark a theme "unmet": true when shoppers wanted something the store seems NOT to have — a product, colour, size, or variant that isn't available, or something out of stock, or repeated price/discount pushback.
Ignore order-status checks, greetings, and thanks.
Return STRICT JSON: {"summary": string (1-2 sentences on what shoppers wanted this week), "themes": [{"topic": string (short, specific — e.g. "red Classic T-Shirt", "size M in hoodies", "bulk discount"), "mentions": number, "unmet": boolean}]}. Max 8 themes, most-mentioned first.`;

export async function getChatDemandObservations(
  businessId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<Observation[]> {
  if (!geminiConfigured()) return [];
  const db = getAdminSupabase();

  const { data: msgs } = await db
    .from("storefront_conversation_messages")
    .select("content, created_at")
    .eq("business_id", businessId)
    .eq("role", "user")
    .gte("created_at", periodStart.toISOString())
    .lt("created_at", periodEnd.toISOString())
    .order("created_at", { ascending: true })
    .limit(400);

  const lines = (msgs ?? [])
    .map((m) => (m.content as string)?.trim())
    .filter((t) => t && t.length > 1)
    .slice(0, 300);
  if (lines.length < 4) return [];

  const ai = await geminiGenerate(
    `Shopper messages this week (one per line):\n\n${lines.map((l) => `- ${l}`).join("\n").slice(0, 12000)}`,
    { system: SYSTEM, json: true, maxOutputTokens: 1024, temperature: 0.2 },
  );
  const parsed = ai ? parseJsonResponse<DemandExtract>(ai.text) : null;
  if (!parsed || !Array.isArray(parsed.themes) || !parsed.themes.length) return [];

  const out: Observation[] = [];
  const total = lines.length;
  const convoNote = ` (from ${total} shopper message${total === 1 ? "" : "s"} to the storefront assistant)`;

  if (parsed.summary) {
    out.push({
      key: "chat-demand-summary",
      severity: "info",
      text: `Storefront assistant — what shoppers asked for: ${parsed.summary.trim()}${convoNote}`,
    });
  }

  for (const [i, t] of parsed.themes.slice(0, 8).entries()) {
    const topic = String(t.topic ?? "").trim();
    if (!topic) continue;
    const mentions = Math.max(1, Math.round(Number(t.mentions) || 1));
    out.push({
      key: `chat-demand-${i}`,
      severity: t.unmet ? "medium" : "info",
      text: t.unmet
        ? `${mentions} shopper${mentions === 1 ? "" : "s"} asked the assistant for "${topic}" — not currently available. Consider stocking it.`
        : `Shoppers asked the assistant about "${topic}" (${mentions}×).`,
    });
  }

  if (ai) {
    // record the model call against the daily AI ceiling
    const { recordAiCalls } = await import("@/lib/ai/budget");
    await recordAiCalls(db, businessId, null, 1, ai.model).catch(() => undefined);
  }

  return out;
}
