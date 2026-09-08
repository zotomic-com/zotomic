/**
 * Who a customer-facing store invoice appears to come from (items 4 & 5).
 *
 * Deliverability reality: we send over Zotomic's mail infrastructure (Gmail
 * SMTP), so the envelope From must stay a Zotomic address. We vary the *display
 * name* and the *Reply-To*:
 *
 *   free store  → From: "<Store> (via Zotomic)" <invoice@zotomic.com>
 *                 Reply-To: the store's contact email (if set)
 *   paid store  → From: "<Store>" <invoice@zotomic.com>
 *                 Reply-To: the address the owner set for invoices
 *
 * True send-as-their-domain (SPF/DKIM) is a later custom-domain-tier feature.
 * `invoice@zotomic.com` is overridable by an admin in Platform Settings.
 */
import { getAdminSupabase } from "@/lib/supabase";
import { getEntitlements } from "@/lib/entitlements";
import { getPlatformSetting, DEFAULT_INVOICE_FROM } from "@/lib/platform-settings";

export interface InvoiceSender {
  /** SMTP From header, e.g. `"Rahman Fashion" <invoice@zotomic.com>` */
  from: string;
  /** Reply-To — where a customer's reply actually goes */
  replyTo?: string;
  branded: boolean;
}

export async function resolveInvoiceSender(businessId: string): Promise<InvoiceSender> {
  const db = getAdminSupabase();
  const [{ data: biz }, ent, platformFromRaw] = await Promise.all([
    db
      .from("businesses")
      .select("name, contact_email, invoice_from_email")
      .eq("id", businessId)
      .maybeSingle(),
    getEntitlements(businessId),
    getPlatformSetting("invoice_from_email"),
  ]);

  const platformFrom = (platformFromRaw || DEFAULT_INVOICE_FROM).trim();
  const storeName = (biz?.name as string) || "Your store";

  if (ent.branded_invoice) {
    const own = ((biz?.invoice_from_email as string) || (biz?.contact_email as string) || "").trim();
    return {
      from: `"${storeName}" <${platformFrom}>`,
      replyTo: own || undefined,
      branded: true,
    };
  }

  return {
    from: `"${storeName} (via Zotomic)" <${platformFrom}>`,
    replyTo: ((biz?.contact_email as string) || "").trim() || undefined,
    branded: false,
  };
}
