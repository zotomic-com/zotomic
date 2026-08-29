import { getAdminSupabase } from "@/lib/supabase";

export const PLATFORM_PAGE_SLUGS = ["privacy", "terms", "refund", "faq"] as const;
export type PlatformPageSlug = (typeof PLATFORM_PAGE_SLUGS)[number];

export const PLATFORM_PAGE_META: Record<PlatformPageSlug, { label: string; route: string }> = {
  privacy: { label: "Privacy Policy", route: "/privacy-policy" },
  terms: { label: "Terms & Conditions", route: "/terms" },
  refund: { label: "Refund Policy", route: "/refund-policy" },
  faq: { label: "FAQ", route: "/faq" },
};

/**
 * Body format: `## Heading` starts a section; blank lines separate paragraphs.
 * Rendered by components/site/RichLegal.
 */
export const PLATFORM_PAGE_DEFAULTS: Record<PlatformPageSlug, { title: string; body: string }> = {
  privacy: {
    title: "Privacy Policy",
    body: `## Who we are
Zotomic is a business-intelligence platform for small online businesses, operated from Bangladesh. This policy covers the marketing site (zotomic.com), the application, and the storefronts we host on behalf of business owners.

## What we collect
Account data: your name, email, phone, and password (stored only as a hash).

Business data: the products, orders, customers, and settings you add or import so we can calculate your metrics and generate reports.

Storefront data: orders and events placed on a storefront you publish, including buyer contact and delivery details supplied at checkout.

Third-party credentials you connect (payment gateway, courier) are encrypted with AES-256 and used only to perform the actions you request.

## How we use it
To provide the service, communicate with you about reports, alerts, billing and support, and to power AI features. Your calculated figures and rule-based observations are sent to our AI provider to write report narratives and power the assistant; we instruct the model to use only the figures provided.

## Tenant isolation
Every business is a separate tenant. Your business data is never pooled with, or shown to, another business.

## Sharing
We share data only with the processors needed to run the service (hosting, database, media, email, AI, and any payment gateway or courier you connect). We do not sell personal data.

## Retention
We keep your data while your account is active. On deletion we remove your business data within 30 days, except records we are legally required to keep.

## Your rights
You can access, correct, export, or delete your data via in-app settings or the data-deletion request form.

## Contact
Questions: hello@zotomic.com.`,
  },
  terms: {
    title: "Terms & Conditions",
    body: `## Agreement
By creating an account you agree to these terms. If you use Zotomic on behalf of a business, you confirm you are authorised to bind that business.

## The service
Zotomic provides analytics, an AI assistant, and a hosted storefront. Reports and assistant output are decision support, not financial or legal advice; verify important figures before acting.

## Your responsibilities
You are responsible for the accuracy of the data you enter, for the products you sell through your storefront, and for complying with the law that applies to your business. You are the merchant of record for storefront sales.

## Billing
Paid plans are billed monthly. Non-payment moves the account through grace, then read-only, then offline states as described on the Billing page. You can cancel at any time.

## Acceptable use
No unlawful, infringing, or abusive content; no attempts to break tenant isolation or disrupt the service.

## Liability
The service is provided "as is". To the extent permitted by law, Zotomic is not liable for indirect or consequential loss, and total liability is limited to the fees paid in the prior three months.

## Changes
We may update these terms; material changes are notified in-app or by email.`,
  },
  refund: {
    title: "Refund Policy",
    body: `## Subscriptions
Zotomic subscriptions are billed monthly in advance and are non-refundable for the current period. You can cancel to stop future charges; your plan stays active until the end of the paid period.

## Errors
If you were charged in error or twice, contact us within 30 days and we will refund the incorrect amount.

## Storefront orders
Refunds for products bought on a storefront are handled by that store under its own refund policy — contact the store directly. Zotomic only provides the platform.

## Contact
Refund questions: hello@zotomic.com.`,
  },
  faq: {
    title: "Frequently Asked Questions",
    body: `## What is Zotomic?
A business-intelligence platform for small online businesses: it turns your orders, products and customers into weekly reports and a plain-language assistant, and hosts your storefront.

## Do I need to be technical?
No. You add or import your data through simple forms, and everything else is automatic.

## How is my data kept separate from other businesses?
Every business is an isolated tenant. Access is enforced in the application and, as a backstop, by database row-level security.

## Can I use my own domain?
Storefronts run at zotomic.com/your-store today. A dedicated domain can be connected on paid plans.

## How do payments and delivery work?
You connect your own payment gateway and courier accounts under Integrations; cash on delivery works with no setup.

## How do I get help?
Email hello@zotomic.com or use the contact form.`,
  },
};

export interface PlatformPage {
  slug: PlatformPageSlug;
  title: string;
  body: string;
  updatedAt: string | null;
}

export async function getPlatformPage(slug: PlatformPageSlug): Promise<PlatformPage> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_pages").select("title, body, updated_at").eq("slug", slug).maybeSingle();
  const def = PLATFORM_PAGE_DEFAULTS[slug];
  return {
    slug,
    title: (data?.title as string) || def.title,
    body: (data?.body as string) ?? def.body,
    updatedAt: (data?.updated_at as string) ?? null,
  };
}

export async function getAllPlatformPages(): Promise<Record<PlatformPageSlug, PlatformPage>> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_pages").select("slug, title, body, updated_at");
  const stored = new Map((data ?? []).map((r) => [r.slug as string, r]));
  const out = {} as Record<PlatformPageSlug, PlatformPage>;
  for (const slug of PLATFORM_PAGE_SLUGS) {
    const row = stored.get(slug);
    const def = PLATFORM_PAGE_DEFAULTS[slug];
    out[slug] = {
      slug,
      title: (row?.title as string) || def.title,
      body: (row?.body as string) ?? def.body,
      updatedAt: (row?.updated_at as string) ?? null,
    };
  }
  return out;
}

export async function setPlatformPage(slug: PlatformPageSlug, title: string, body: string, adminId: string) {
  const db = getAdminSupabase();
  await db
    .from("platform_pages")
    .upsert(
      { slug, title: title.slice(0, 200), body: body.slice(0, 40000), updated_by: adminId, updated_at: new Date().toISOString() },
      { onConflict: "slug" },
    );
}
