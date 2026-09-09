/**
 * Run the fraud check for a freshly-placed order. Records a match, warns the
 * store owner (unless the admin disabled warnings for that store), and puts the
 * order on hold when the person is Stage-3 (Blacklist).
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { getActiveFlagByPhone, getActiveFlagByEmail } from "./flags";
import { normalizePhone, STAGE_LABEL, CATEGORY_LABEL } from "./phone";

export async function checkOrderForFraud(
  orderId: string,
  contact: { phone?: string | null; email?: string | null; name?: string | null },
): Promise<{ matched: boolean; stage?: number; held?: boolean }> {
  try {
    const db = getAdminSupabase();
    const { data: order } = await db
      .from("orders")
      .select("id, business_id, order_number")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return { matched: false };

    let flag = contact.phone ? await getActiveFlagByPhone(contact.phone) : null;
    let matchedOn = "phone";
    if (!flag && contact.email) {
      flag = await getActiveFlagByEmail(contact.email);
      matchedOn = "email";
    }
    if (!flag) return { matched: false };

    const held = flag.stage >= 3;

    await db.from("fraud_order_matches").insert({
      order_id: order.id,
      business_id: order.business_id,
      flag_id: flag.id,
      stage: flag.stage,
      matched_on: matchedOn,
      held,
    });

    if (held) {
      await db.from("orders").update({ fraud_hold: true }).eq("id", order.id);
    }

    // refresh the flag's activity + remember this store
    const stores = Array.isArray(flag.stores) ? flag.stores : [];
    if (!stores.some((s) => s.businessId === order.business_id)) {
      const { data: biz } = await db.from("businesses").select("name").eq("id", order.business_id).maybeSingle();
      stores.push({ businessId: order.business_id as string, name: (biz?.name as string) ?? "—" });
    }
    await db
      .from("fraud_flags")
      .update({ last_activity_at: new Date().toISOString(), stores })
      .eq("id", flag.id);

    // warn the store owner
    const { data: biz } = await db
      .from("businesses")
      .select("fraud_warnings_enabled")
      .eq("id", order.business_id)
      .maybeSingle();
    if (biz?.fraud_warnings_enabled !== false) {
      const label = STAGE_LABEL[flag.stage] ?? "Watch";
      const cat = CATEGORY_LABEL[flag.category] ?? "risk signals";
      await db.from("notifications").insert({
        business_id: order.business_id,
        type: "fraud_alert",
        title:
          flag.stage >= 3
            ? `⚠️ Order ${order.order_number} placed on hold — blacklisted customer`
            : `⚠️ Fraud ${label} — verify order ${order.order_number}`,
        body:
          flag.stage >= 3
            ? `This customer is blacklisted (${cat}). The order is on hold — verify by phone/WhatsApp/email before shipping, then clear the hold or cancel.`
            : `This customer is on the fraud watchlist at ${label} stage (${cat}). Verify the order directly before you confirm it.`,
        href: `/app/orders/${order.id}`,
      });
    }

    return { matched: true, stage: flag.stage, held };
  } catch (e) {
    console.error("checkOrderForFraud failed", (e as Error).message);
    return { matched: false };
  }
}

export { normalizePhone };
