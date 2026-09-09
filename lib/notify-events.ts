/** Notification event catalogs + pure pref helpers (safe on the client). */

export type Channel = "in_app" | "email" | "telegram";

export interface EventDef {
  key: string;
  label: string;
  hint: string;
  channels: Channel[];
  default: Partial<Record<Channel, boolean>>;
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  in_app: "In-app",
  email: "Email",
  telegram: "Telegram",
};

export const OWNER_EVENTS: EventDef[] = [
  { key: "new_order", label: "New order", hint: "A customer places an order on your storefront", channels: ["in_app", "email", "telegram"], default: { in_app: true, email: true, telegram: false } },
  { key: "low_stock", label: "Low stock", hint: "A tracked product drops below 10 in stock", channels: ["in_app", "email"], default: { in_app: true, email: false } },
  { key: "fraud_alert", label: "Fraud warning", hint: "A flagged customer places an order", channels: ["in_app", "email", "telegram"], default: { in_app: true, email: true, telegram: false } },
  { key: "new_review", label: "New review", hint: "A customer leaves a product review to moderate", channels: ["in_app", "email"], default: { in_app: true, email: false } },
  { key: "return_request", label: "Return request", hint: "A return / refund is requested", channels: ["in_app", "email"], default: { in_app: true, email: true } },
  { key: "order_cancelled", label: "Order cancelled by shopper", hint: "A customer cancels their own pending order", channels: ["in_app", "email", "telegram"], default: { in_app: true, email: true, telegram: false } },
  { key: "weekly_report", label: "Weekly report ready", hint: "Your Weekly Intelligence report is generated", channels: ["in_app", "email", "telegram"], default: { in_app: true, email: true, telegram: false } },
  { key: "payment", label: "Payment updates", hint: "A credit / subscription payment is confirmed or rejected", channels: ["in_app", "email"], default: { in_app: true, email: true } },
];

export const ADMIN_EVENTS: EventDef[] = [
  { key: "new_store", label: "New store signup", hint: "A new business joins Zotomic", channels: ["in_app", "email", "telegram"], default: { in_app: true, email: false, telegram: true } },
  { key: "payment_pending", label: "Payment to confirm", hint: "A store submits a bKash / Nagad payment", channels: ["in_app", "email", "telegram"], default: { in_app: true, email: true, telegram: true } },
  { key: "fraud_new", label: "New fraud flag", hint: "A customer is flagged (auto or manual)", channels: ["in_app", "telegram"], default: { in_app: true, telegram: false } },
  { key: "report_failed", label: "Weekly report failed", hint: "A report generation errors out", channels: ["in_app", "telegram"], default: { in_app: true, telegram: true } },
  { key: "store_at_cap", label: "Storefront assistant at cap", hint: "A store's chatbot hits its monthly limit", channels: ["in_app"], default: { in_app: true } },
];

export const CUSTOMER_EVENTS: EventDef[] = [
  { key: "order_updates", label: "Order updates", hint: "Confirmation and delivery updates for your orders", channels: ["email"], default: { email: true } },
  { key: "review_invite", label: "Review invitations", hint: "A request to review a product after delivery", channels: ["email"], default: { email: true } },
  { key: "marketing", label: "Offers & news", hint: "Promotions and newsletters from the store", channels: ["email"], default: { email: false } },
];

export type Prefs = Record<string, Partial<Record<Channel, boolean>>>;

/** Merge stored prefs with the catalog defaults into a complete matrix. */
export function resolvePrefs(catalog: EventDef[], raw: unknown): Prefs {
  const stored = (raw ?? {}) as Prefs;
  const out: Prefs = {};
  for (const e of catalog) {
    const s = stored[e.key] ?? {};
    out[e.key] = {};
    for (const ch of e.channels) out[e.key][ch] = typeof s[ch] === "boolean" ? (s[ch] as boolean) : !!e.default[ch];
  }
  return out;
}

/** Clamp a submitted prefs object to the catalog shape. */
export function sanitizePrefs(catalog: EventDef[], input: unknown): Prefs {
  const src = (input ?? {}) as Prefs;
  const out: Prefs = {};
  for (const e of catalog) {
    out[e.key] = {};
    for (const ch of e.channels) out[e.key][ch] = src[e.key]?.[ch] === true;
  }
  return out;
}
