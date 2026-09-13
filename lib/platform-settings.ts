import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/auth";

/** Admin-only platform configuration. Secret values are AES-encrypted at rest. */
export const PLATFORM_KEYS = {
  telegram_bot_token: { secret: true, label: "Telegram bot token" },
  meta_pixel_id: { secret: false, label: "Meta Pixel ID (zotomic.com)" },
  ga4_measurement_id: { secret: false, label: "GA4 Measurement ID (zotomic.com)" },
  ga4_api_secret: { secret: true, label: "GA4 API Secret (server-side)" },
  // payments — one number each, shared by subscription payments + credit top-ups
  payment_bkash_number: { secret: false, label: "bKash number (personal — payments)" },
  payment_nagad_number: { secret: false, label: "Nagad number (personal — payments)" },
  // invoicing — the From address for store invoices sent to buyers (free plan)
  invoice_from_email: { secret: false, label: "Invoice sender email (free stores)" },
  // Automation / agent gateway — entered here, wired to live calls later
  hermes_base_url: { secret: false, label: "Hermes gateway base URL" },
  hermes_shared_secret: { secret: true, label: "Hermes shared secret" },
  n8n_base_url: { secret: false, label: "n8n base URL" },
  n8n_api_key: { secret: true, label: "n8n API key" },
  n8n_webhook_url: { secret: false, label: "n8n inbound webhook URL" },
  // Optional platform-wide fallback for verifying Meta webhook signatures
  meta_app_secret: { secret: true, label: "Meta app secret (webhook fallback)" },
  // Website CMS — branding + search console (site-wide, zotomic.com)
  google_site_verification: { secret: false, label: "Google Search Console verification code" },
  site_logo_url: { secret: false, label: "Custom logo URL" },
  site_favicon_url: { secret: false, label: "Custom favicon URL" },
  footer_tagline: { secret: false, label: "Footer tagline" },
  footer_copyright: { secret: false, label: "Footer copyright line" },
  footer_trust_items: { secret: false, label: "Footer trust strip (JSON)" },
  // Domain reseller — /domains, funded from the admin's own Dynadot balance
  domain_reseller_enabled: { secret: false, label: "Publish the /domains page" },
  dynadot_use_sandbox: { secret: false, label: "Use Dynadot sandbox (test mode, no real charges)" },
  dynadot_sandbox_api_key: { secret: true, label: "Dynadot sandbox API key" },
  dynadot_sandbox_api_secret: { secret: true, label: "Dynadot sandbox API secret" },
  dynadot_api_key: { secret: true, label: "Dynadot live API key" },
  dynadot_api_secret: { secret: true, label: "Dynadot live API secret" },
  cloudflare_api_token: { secret: true, label: "Cloudflare API token" },
  cloudflare_account_id: { secret: false, label: "Cloudflare account ID" },
  domain_bkash_number: { secret: false, label: "bKash number (domain sales)" },
  domain_nagad_number: { secret: false, label: "Nagad number (domain sales)" },
  domain_sms_webhook_secret: { secret: true, label: "SMS webhook secret" },
  domain_markup_percent: { secret: false, label: "Markup over wholesale (%)" },
  domain_usd_to_bdt_rate: { secret: false, label: "Fallback USD → BDT rate (used only if the live feed is unreachable)" },
  domain_grace_days: { secret: false, label: "Grace period after expiry (days)" },
} as const;

export type PlatformKey = keyof typeof PLATFORM_KEYS;

/** Which admin screen owns each key. */
export const PLATFORM_KEY_GROUPS = {
  settings: ["telegram_bot_token", "payment_bkash_number", "payment_nagad_number", "invoice_from_email"],
  integrations: ["hermes_base_url", "hermes_shared_secret", "n8n_base_url", "n8n_api_key", "n8n_webhook_url", "meta_app_secret"],
  seo: ["google_site_verification", "meta_pixel_id", "ga4_measurement_id", "ga4_api_secret"],
  branding: ["site_logo_url", "site_favicon_url", "footer_tagline", "footer_copyright"],
  domains: [
    "domain_reseller_enabled",
    "dynadot_use_sandbox",
    "dynadot_sandbox_api_key",
    "dynadot_sandbox_api_secret",
    "dynadot_api_key",
    "dynadot_api_secret",
    "cloudflare_api_token",
    "cloudflare_account_id",
    "domain_bkash_number",
    "domain_nagad_number",
    "domain_sms_webhook_secret",
    "domain_markup_percent",
    "domain_usd_to_bdt_rate",
    "domain_grace_days",
  ],
} as const satisfies Record<string, readonly PlatformKey[]>;

export const DEFAULT_INVOICE_FROM = "invoice@zotomic.com";

/** Payment numbers for the owner-facing top-up / billing screens. */
export async function getPaymentNumbers(): Promise<{ bkash: string; nagad: string }> {
  const [bkash, nagad] = await Promise.all([
    getPlatformSetting("payment_bkash_number"),
    getPlatformSetting("payment_nagad_number"),
  ]);
  return { bkash: bkash ?? "", nagad: nagad ?? "" };
}

export async function getPlatformSetting(key: PlatformKey): Promise<string | null> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_settings").select("value").eq("key", key).maybeSingle();
  if (!data?.value) return null;
  return PLATFORM_KEYS[key].secret ? decrypt(data.value) || null : data.value;
}

export async function getPlatformSettings(): Promise<Record<string, string>> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_settings").select("key, value");
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const k = row.key as PlatformKey;
    if (!PLATFORM_KEYS[k]) continue;
    out[k] = PLATFORM_KEYS[k].secret ? decrypt(row.value as string) || "" : (row.value as string);
  }
  return out;
}

export async function setPlatformSetting(key: PlatformKey, value: string, adminId: string) {
  const db = getAdminSupabase();
  const stored = value ? (PLATFORM_KEYS[key].secret ? encrypt(value) : value) : null;
  await db
    .from("platform_settings")
    .upsert({ key, value: stored, updated_by: adminId, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export interface DomainSettings {
  enabled: boolean;
  dynadotUseSandbox: boolean;
  dynadotSandboxApiKey: string;
  dynadotSandboxApiSecret: string;
  dynadotApiKey: string;
  dynadotApiSecret: string;
  cloudflareApiToken: string;
  cloudflareAccountId: string;
  bkashNumber: string;
  nagadNumber: string;
  smsWebhookSecret: string;
  markupPercent: number;
  usdToBdtRate: number;
  graceDays: number;
}

/** Domain-reseller config for /domains, the admin panel, and the fulfillment lib. Cached 5 min. */
export const getDomainSettings = unstable_cache(
  async (): Promise<DomainSettings> => {
    const db = getAdminSupabase();
    const { data } = await db
      .from("platform_settings")
      .select("key, value")
      .in("key", [
        "domain_reseller_enabled",
        "dynadot_use_sandbox",
        "dynadot_sandbox_api_key",
        "dynadot_sandbox_api_secret",
        "dynadot_api_key",
        "dynadot_api_secret",
        "cloudflare_api_token",
        "cloudflare_account_id",
        "domain_bkash_number",
        "domain_nagad_number",
        "domain_sms_webhook_secret",
        "domain_markup_percent",
        "domain_usd_to_bdt_rate",
        "domain_grace_days",
      ]);
    const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string | null]));
    const decryptIf = (key: PlatformKey) => {
      const raw = map.get(key);
      if (!raw) return "";
      return PLATFORM_KEYS[key].secret ? decrypt(raw) || "" : raw;
    };
    return {
      enabled: map.get("domain_reseller_enabled") === "true",
      dynadotUseSandbox: map.get("dynadot_use_sandbox") === "true",
      dynadotSandboxApiKey: decryptIf("dynadot_sandbox_api_key"),
      dynadotSandboxApiSecret: decryptIf("dynadot_sandbox_api_secret"),
      dynadotApiKey: decryptIf("dynadot_api_key"),
      dynadotApiSecret: decryptIf("dynadot_api_secret"),
      cloudflareApiToken: decryptIf("cloudflare_api_token"),
      cloudflareAccountId: map.get("cloudflare_account_id") ?? "",
      bkashNumber: map.get("domain_bkash_number") ?? "",
      nagadNumber: map.get("domain_nagad_number") ?? "",
      smsWebhookSecret: decryptIf("domain_sms_webhook_secret"),
      markupPercent: Number(map.get("domain_markup_percent")) || 40,
      usdToBdtRate: Number(map.get("domain_usd_to_bdt_rate")) || 122,
      graceDays: Number(map.get("domain_grace_days")) || 30,
    };
  },
  ["domain-settings"],
  { revalidate: 300, tags: ["platform-settings"] },
);

/** Public (non-secret) platform tracking config for the marketing site. Cached 5 min. */
export const getPublicTracking = unstable_cache(
  async (): Promise<{ metaPixelId: string; ga4Id: string }> => {
    try {
      const db = getAdminSupabase();
      const { data } = await db
        .from("platform_settings")
        .select("key, value")
        .in("key", ["meta_pixel_id", "ga4_measurement_id"]);
      const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      return { metaPixelId: map.meta_pixel_id ?? "", ga4Id: map.ga4_measurement_id ?? "" };
    } catch {
      return { metaPixelId: "", ga4Id: "" };
    }
  },
  ["public-tracking"],
  { revalidate: 300, tags: ["platform-settings"] },
);

export interface FooterTrustItem {
  icon: string;
  title: string;
  text: string;
}

const DEFAULT_TRUST_ITEMS: FooterTrustItem[] = [
  { icon: "ShieldCheck", title: "Secure & Private", text: "Your data is protected with enterprise-grade security." },
  { icon: "CloudCog", title: "Reliable", text: "Built on modern, scalable infrastructure you can trust." },
  { icon: "Lock", title: "You're in Control", text: "You own your data. Always." },
  { icon: "Headphones", title: "Support That Cares", text: "We're here to help you succeed." },
];

const DEFAULT_TAGLINE =
  "Business intelligence, without the complexity. See what's happening, understand why, and act with confidence.";
const DEFAULT_COPYRIGHT = "Zotomic. All rights reserved.";

/** Site-wide branding, GSC verification, and footer copy for the marketing site. Cached 5 min. */
export const getSiteBranding = unstable_cache(
  async (): Promise<{
    logoUrl: string;
    faviconUrl: string;
    googleSiteVerification: string;
    footerTagline: string;
    footerCopyright: string;
    footerTrust: FooterTrustItem[];
  }> => {
    try {
      const db = getAdminSupabase();
      const { data } = await db
        .from("platform_settings")
        .select("key, value")
        .in("key", ["site_logo_url", "site_favicon_url", "google_site_verification", "footer_tagline", "footer_copyright", "footer_trust_items"]);
      const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      let trust = DEFAULT_TRUST_ITEMS;
      if (map.footer_trust_items) {
        try {
          const parsed = JSON.parse(map.footer_trust_items);
          if (Array.isArray(parsed) && parsed.length) trust = parsed;
        } catch {
          /* keep defaults */
        }
      }
      return {
        logoUrl: map.site_logo_url ?? "",
        faviconUrl: map.site_favicon_url ?? "",
        googleSiteVerification: map.google_site_verification ?? "",
        footerTagline: map.footer_tagline || DEFAULT_TAGLINE,
        footerCopyright: map.footer_copyright || DEFAULT_COPYRIGHT,
        footerTrust: trust,
      };
    } catch {
      return {
        logoUrl: "",
        faviconUrl: "",
        googleSiteVerification: "",
        footerTagline: DEFAULT_TAGLINE,
        footerCopyright: DEFAULT_COPYRIGHT,
        footerTrust: DEFAULT_TRUST_ITEMS,
      };
    }
  },
  ["site-branding"],
  { revalidate: 300, tags: ["platform-settings"] },
);

export async function setFooterTrustItems(items: FooterTrustItem[], adminId: string) {
  await setPlatformSetting("footer_trust_items", JSON.stringify(items.slice(0, 8)), adminId);
}

/** Server-side GA4 event (Measurement Protocol) for the marketing site. */
export async function ga4ServerEvent(clientId: string, name: string, params: Record<string, unknown> = {}) {
  const [mid, secret] = await Promise.all([
    getPlatformSetting("ga4_measurement_id"),
    getPlatformSetting("ga4_api_secret"),
  ]);
  if (!mid || !secret) return;
  try {
    await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${mid}&api_secret=${secret}`, {
      method: "POST",
      body: JSON.stringify({
        client_id: clientId || `${Date.now()}.${Math.random().toString(36).slice(2)}`,
        events: [{ name, params }],
      }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    /* non-fatal */
  }
}
