/**
 * Central notification dispatch. Preferences live per audience in a JSONB
 * `notification_prefs` column (owner → businesses, admin → users, customer →
 * store_accounts). `notifyOwner` / `notifyAdmins` check prefs and fan out to
 * the enabled channels; `channelAllowed` gates a standalone email send.
 * Event catalogs + pure helpers are in ./notify-events (client-safe).
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { sendEmail, emailLayout, type MailAccount } from "@/lib/email";
import {
  OWNER_EVENTS,
  ADMIN_EVENTS,
  CUSTOMER_EVENTS,
  resolvePrefs,
  type Channel,
  type Prefs,
} from "./notify-events";

export { OWNER_EVENTS, ADMIN_EVENTS, CUSTOMER_EVENTS };
export type { Channel, Prefs };

export async function getOwnerPrefs(businessId: string): Promise<Prefs> {
  const { data } = await getAdminSupabase().from("businesses").select("notification_prefs").eq("id", businessId).maybeSingle();
  return resolvePrefs(OWNER_EVENTS, data?.notification_prefs);
}
export async function getAdminPrefs(userId: string): Promise<Prefs> {
  const { data } = await getAdminSupabase().from("users").select("notification_prefs").eq("id", userId).maybeSingle();
  return resolvePrefs(ADMIN_EVENTS, data?.notification_prefs);
}
export async function getCustomerPrefs(accountId: string): Promise<Prefs> {
  const { data } = await getAdminSupabase().from("store_accounts").select("notification_prefs").eq("id", accountId).maybeSingle();
  return resolvePrefs(CUSTOMER_EVENTS, data?.notification_prefs);
}

/** Standalone check — e.g. before sending a review-invite email. */
export async function channelAllowed(
  scope: "owner" | "admin" | "customer",
  id: string,
  event: string,
  channel: Channel,
): Promise<boolean> {
  const prefs =
    scope === "owner" ? await getOwnerPrefs(id) : scope === "admin" ? await getAdminPrefs(id) : await getCustomerPrefs(id);
  return prefs[event]?.[channel] ?? false;
}

/* ── dispatch ───────────────────────────────────────────────────────────── */

interface NotifyArgs {
  title: string;
  body: string;
  href?: string;
  /** platform-admin notifications carry the store they concern (optional) */
  businessId?: string;
  email?: { subject?: string; html?: string; account?: MailAccount; to?: string };
}

const plainHtml = (title: string, body: string) =>
  emailLayout(`<p style="margin:0 0 8px;font-weight:600">${title}</p><p style="margin:0;color:#475569">${body}</p>`);

async function tgOwner(businessId: string, text: string) {
  const { data: b } = await getAdminSupabase().from("businesses").select("telegram_chat_id").eq("id", businessId).maybeSingle();
  const chatId = b?.telegram_chat_id as string | undefined;
  if (!chatId) return;
  const { sendTelegram } = await import("@/lib/telegram");
  await sendTelegram(chatId, text);
}

export async function notifyOwner(businessId: string, event: string, args: NotifyArgs): Promise<void> {
  try {
    const db = getAdminSupabase();
    const p = (await getOwnerPrefs(businessId))[event] ?? {};

    if (p.in_app) {
      await db.from("notifications").insert({
        business_id: businessId,
        type: event,
        title: args.title,
        body: args.body,
        href: args.href ?? "/app",
      });
    }
    if (p.email) {
      let to = args.email?.to || "";
      if (!to) {
        const [{ data: biz }, { data: owner }] = await Promise.all([
          db.from("businesses").select("contact_email").eq("id", businessId).maybeSingle(),
          db.from("business_members").select("users(email)").eq("business_id", businessId).eq("role", "owner").maybeSingle(),
        ]);
        to =
          (biz?.contact_email as string) ||
          ((Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { email?: string } | null)?.email ||
          "";
      }
      if (to) {
        await sendEmail({
          to,
          account: args.email?.account ?? "admin",
          subject: args.email?.subject ?? args.title,
          html: args.email?.html ?? plainHtml(args.title, args.body),
        });
      }
    }
    if (p.telegram) await tgOwner(businessId, `<b>${args.title}</b>\n${args.body}`);
  } catch (e) {
    console.error("notifyOwner failed", (e as Error).message);
  }
}

export async function notifyAdmins(event: string, args: NotifyArgs): Promise<void> {
  try {
    const db = getAdminSupabase();
    const { data: admins } = await db.from("users").select("id, email, notification_prefs").eq("role", "admin");
    let anyTelegram = false;
    for (const a of admins ?? []) {
      const p = resolvePrefs(ADMIN_EVENTS, a.notification_prefs)[event] ?? {};
      if (p.in_app) {
        await db.from("notifications").insert({
          user_id: a.id as string,
          business_id: args.businessId ?? null,
          type: event,
          title: args.title,
          body: args.body,
          href: args.href ?? "/admin",
        });
      }
      if (p.email && a.email) {
        await sendEmail({
          to: a.email as string,
          account: "admin",
          subject: args.email?.subject ?? args.title,
          html: args.email?.html ?? plainHtml(args.title, args.body),
        });
      }
      if (p.telegram) anyTelegram = true;
    }
    if (anyTelegram) {
      const { pushAdminAlert } = await import("@/lib/admin/notify");
      await pushAdminAlert(`<b>${args.title}</b>\n${args.body}`);
    }
  } catch (e) {
    console.error("notifyAdmins failed", (e as Error).message);
  }
}
