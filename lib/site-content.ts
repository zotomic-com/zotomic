import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";
import { getAllNavLinks, createNavLink, deleteNavLink } from "@/lib/site-nav";

/**
 * Website CMS — every page on zotomic.com (the marketing site) in one place.
 *
 * "Structural" pages (home, pricing, features, ...) keep their fixed layout in
 * code; the admin edits their copy (headline, items, CTA) through `content`
 * jsonb. Falls back to STRUCTURAL_DEFAULTS when nothing has been saved yet, so
 * the site renders correctly before any admin ever opens the CMS.
 *
 * "Custom" pages (privacy/terms/refund/faq, and any new page an admin adds)
 * are freeform: a title + a `## Heading` / paragraph body, rendered by
 * components/site/RichLegal. New custom pages live at /p/<slug>; the four
 * legacy legal pages keep their historic fixed routes.
 */

export interface PageItem {
  icon: string;
  title: string;
  text: string;
}

export interface StructuralContent {
  seoTitle: string;
  seoDescription: string;
  badge: string;
  title: string;
  titleHighlight: string;
  subtitle: string;
  itemsTitle: string;
  items: PageItem[];
  items2Title: string;
  items2: PageItem[];
  bodyTitle: string;
  body: string;
  ctaEnabled: boolean;
  ctaTitle: string;
  ctaSubtitle: string;
}

const emptyItem = (): PageItem => ({ icon: "Sparkles", title: "", text: "" });

function blankStructural(): StructuralContent {
  return {
    seoTitle: "",
    seoDescription: "",
    badge: "",
    title: "",
    titleHighlight: "",
    subtitle: "",
    itemsTitle: "",
    items: [],
    items2Title: "",
    items2: [],
    bodyTitle: "",
    body: "",
    ctaEnabled: false,
    ctaTitle: "",
    ctaSubtitle: "",
  };
}

export const STRUCTURAL_SLUGS = [
  "home",
  "pricing",
  "features",
  "how-it-works",
  "intelligence",
  "assistant",
  "storefront",
  "about",
  "contact",
  "help",
] as const;
export type StructuralSlug = (typeof STRUCTURAL_SLUGS)[number];

export const STRUCTURAL_META: Record<StructuralSlug, { label: string; route: string }> = {
  home: { label: "Home", route: "/" },
  pricing: { label: "Pricing", route: "/pricing" },
  features: { label: "Features", route: "/features" },
  "how-it-works": { label: "How it works", route: "/how-it-works" },
  intelligence: { label: "Intelligence", route: "/intelligence" },
  assistant: { label: "Assistant", route: "/assistant" },
  storefront: { label: "Storefront", route: "/storefront" },
  about: { label: "About", route: "/about" },
  contact: { label: "Contact", route: "/contact" },
  help: { label: "Help", route: "/help" },
};

export const STRUCTURAL_DEFAULTS: Record<StructuralSlug, StructuralContent> = {
  home: {
    ...blankStructural(),
    seoTitle: "See. Understand. Act.",
    seoDescription:
      "Zotomic turns your business data into clarity — and clarity into action. Weekly intelligence, a universal storefront, and an AI assistant for small businesses.",
    badge: "Business intelligence, without the complexity.",
    title: "See. Understand. Act.",
    titleHighlight: "Understand.",
    subtitle: "Turn your business data into clarity — and clarity into action.",
    items: [
      { icon: "Eye", title: "SEE", text: "what's happening across your business." },
      { icon: "Lightbulb", title: "UNDERSTAND", text: "why it matters with clear insights and context." },
      { icon: "Target", title: "ACT", text: "on what matters and grow with confidence." },
    ],
  },
  pricing: {
    ...blankStructural(),
    seoTitle: "Pricing",
    seoDescription: "Simple, transparent plans. Free to start — no credit card required.",
    badge: "Pricing",
    title: "Start free. Upgrade when it pays for itself.",
    subtitle: "Plan limits are configurable — these are starting points, not commercial law.",
    body: "Prices in BDT. Billing is confirmed manually — pay by bKash, submit your transaction ID, and your account unlocks as soon as we confirm it.",
  },
  features: {
    ...blankStructural(),
    seoTitle: "Features",
    seoDescription:
      "Weekly business intelligence, a dashboard that stays useful between reports, a universal storefront, and an AI assistant that reads your business.",
    badge: "Features",
    title: "Everything you need to run on the numbers",
    subtitle: "No giant feature grid to wade through — just the tools that make a weekly decision easier.",
    items: [
      { icon: "BarChart3", title: "Weekly Intelligence", text: "A report every week: what changed, why, and what to do — with the evidence behind every claim." },
      { icon: "FileText", title: "Report history", text: "Every past report, searchable, with the underlying metrics and insights kept intact." },
      { icon: "MessageSquareText", title: "Zotomic Assistant", text: "Ask about any number or insight. It reads your business context and never invents data." },
      { icon: "Store", title: "Universal storefront", text: "One clean, fast, mobile-first store — configure, preview, publish. Cash on delivery built in." },
      { icon: "Boxes", title: "Products with real costs", text: "Track buying price and marketing cost so profit — not just revenue — is always visible." },
      { icon: "ShoppingCart", title: "Orders & customers", text: "Every order and customer in one place, feeding the same engine that writes your reports." },
      { icon: "Bell", title: "Alerts that matter", text: "Unusual returns, stock risk, a revenue dip — surfaced the moment they happen." },
      { icon: "Users", title: "Customer intelligence", text: "New vs repeat customers, spend patterns, and who's worth keeping close." },
      { icon: "ShieldCheck", title: "Your data, isolated", text: "Every business is a hard boundary. Credentials are encrypted. Nothing is shared." },
    ],
    ctaEnabled: true,
  },
  "how-it-works": {
    ...blankStructural(),
    seoTitle: "How it works",
    seoDescription: "Connect your business information, let Zotomic analyze it, and receive clear insights and actions every week.",
    badge: "How it works",
    title: "From data to decision, every week",
    subtitle: "Zotomic is built around one loop: See what happened, understand why, act on it.",
    items: [
      { icon: "Sparkles", title: "Connect your data", text: "Add products and orders manually, import a CSV, or connect your Facebook Page. All optional, all skippable." },
      { icon: "Sparkles", title: "Zotomic analyzes it", text: "Deterministic calculations turn raw numbers into revenue, profit, returns and trends — compared to the period before." },
      { icon: "Sparkles", title: "You get insights & actions", text: "A weekly report tells you what changed, why it matters, and what to do next. Ask the assistant to dig deeper." },
    ],
    ctaEnabled: true,
  },
  intelligence: {
    ...blankStructural(),
    seoTitle: "Weekly Intelligence",
    seoDescription:
      "A weekly business report that separates fact from interpretation: measured metrics, period-over-period comparison, anomalies, and evidence-backed recommendations.",
    badge: "Weekly Intelligence",
    title: "The report that tells you what to do",
    subtitle: "Sales up but profit down? You'll know in week one — because buying price and marketing cost are part of the math.",
    items: [
      { icon: "Eye", title: "SEE — measured, not guessed", text: "Revenue, orders, returns and estimated profit are calculated by deterministic code from your data. When something can't be calculated yet, the report says so instead of showing a zero." },
      { icon: "Lightbulb", title: "UNDERSTAND — why it moved", text: "Every metric is compared to the previous comparable period. Anomalies and threshold breaches are flagged, and each insight carries the evidence it's based on plus a confidence level." },
      { icon: "Target", title: "ACT — a short list of next steps", text: "Recommendations are tied to the evidence that prompted them and ranked by effort and impact — so you finish the report knowing what to do on Monday." },
    ],
    bodyTitle: "Runs on its own",
    body: "Reports are generated by a scheduled background job — they don't need you to keep a browser open. If there isn't enough history yet, the report states exactly what's missing rather than filling the gap with a guess.",
    ctaEnabled: true,
  },
  assistant: {
    ...blankStructural(),
    seoTitle: "Zotomic Assistant",
    seoDescription:
      "An AI assistant that reads your business context, explains your metrics and reports, and performs a small set of low-risk actions with your confirmation.",
    badge: "Zotomic Assistant",
    title: "Ask your business a question",
    subtitle: "The assistant works from your real, calculated numbers — it interprets them, it doesn't invent them.",
    itemsTitle: "What it can do",
    items: [
      { icon: "CheckCircle2", title: "", text: "Explain any metric or insight in this week's report" },
      { icon: "CheckCircle2", title: "", text: "Pull product, order and customer summaries on request" },
      { icon: "CheckCircle2", title: "", text: "Compare periods and surface what changed" },
      { icon: "CheckCircle2", title: "", text: "Draft a task list from the recommendations" },
      { icon: "CheckCircle2", title: "", text: "Update a product field or a setting — with your confirmation" },
    ],
    items2: [
      { icon: "ShieldCheck", title: "Safe by design", text: "It can only read your own business's data, has no database access, and every consequential change needs your explicit approval." },
      { icon: "MessageSquareText", title: "Always optional", text: "The dashboard and reports work fully without it. The assistant adds investigation and controlled actions on top." },
    ],
    ctaEnabled: true,
  },
  storefront: {
    ...blankStructural(),
    seoTitle: "Storefront",
    seoDescription: "One universal storefront theme — fully configurable, mobile-first, fast, and readable by search engines and AI. Cash on delivery built in.",
    badge: "Storefront",
    title: "A store that sells — and reports back",
    subtitle: "Every order placed on your storefront flows into the same engine that writes your weekly intelligence.",
    items: [
      { icon: "Palette", title: "One universal theme", text: "No template maze. Set your brand, pick your sections, publish. It always looks right." },
      { icon: "Gauge", title: "Built for speed", text: "Server-rendered and image-optimized — aiming for a perfect performance score on every store." },
      { icon: "ShoppingBag", title: "COD checkout", text: "Cash on delivery is always available. Connect a payment gateway later if you want one." },
      { icon: "Heart", title: "Wishlist & reviews", text: "Shoppers save favourites; verified buyers leave reviews you moderate." },
      { icon: "Search", title: "Found by search & AI", text: "Clean URLs, structured data, and a per-store llms.txt so crawlers and assistants understand your catalog." },
      { icon: "Globe", title: "Your own address", text: "Launch on a Zotomic subdomain in minutes; connect a custom domain when you're ready." },
    ],
    ctaEnabled: true,
    ctaTitle: "Launch your storefront",
    ctaSubtitle: "Included on every plan. Start free.",
  },
  about: {
    ...blankStructural(),
    seoTitle: "About",
    seoDescription: "Zotomic is a business-intelligence platform for small online businesses — starting with a weekly report that turns raw numbers into decisions.",
    badge: "About",
    title: "Numbers you can act on",
    subtitle: "Most small businesses have plenty of data and very little clarity. Zotomic closes that gap.",
    bodyTitle: "What we're building",
    body: "Zotomic is a multi-tenant business-intelligence platform for small online businesses. The opening product is Weekly Business Intelligence — a report that calculates your real performance (including profit, not just revenue), explains what changed, and hands you a short list of next steps. Around it sits a universal storefront and an AI assistant that reads your business context.",
    itemsTitle: "How we work",
    items: [
      { icon: "CheckCircle2", title: "", text: "Every number is calculated by code, not guessed by a model." },
      { icon: "CheckCircle2", title: "", text: "Your business is a hard boundary — data is never shared or pooled." },
      { icon: "CheckCircle2", title: "", text: "If something can't be calculated yet, we say so instead of showing a zero." },
      { icon: "CheckCircle2", title: "", text: "The website stays useful even when the assistant is offline." },
    ],
    ctaEnabled: true,
  },
  contact: {
    ...blankStructural(),
    seoTitle: "Contact",
    seoDescription: "Get in touch with the Zotomic team.",
    badge: "Contact",
    title: "Talk to us",
    subtitle: "We reply within 24 hours.",
    items: [
      { icon: "Mail", title: "Email", text: "hello@zotomic.com" },
      { icon: "Clock", title: "Response time", text: "Within 24 hours" },
      { icon: "MapPin", title: "Location", text: "Bangladesh" },
    ],
  },
  help: {
    ...blankStructural(),
    seoTitle: "Help",
    seoDescription: "Answers to common questions about Zotomic, and how to reach support.",
    badge: "Help",
    title: "Questions & answers",
    items: [
      { icon: "", title: "Do I need to connect anything to get started?", text: "No. You can add products and orders manually, upload a CSV, or connect a Facebook Page — all optional. Zotomic will show a clearly-labelled sample report until it has your real data." },
      { icon: "", title: "How is profit calculated?", text: "From the buying price and marketing cost you set on each product, subtracted from revenue. That's why you can see 'sales up, profit down' as early as week one." },
      { icon: "", title: "Is the storefront included?", text: "Yes, on every plan. One universal theme, mobile-first, with cash-on-delivery checkout built in. Payment gateways and custom domains come on paid plans." },
      { icon: "", title: "How does billing work?", text: "Manually, for now. You pay by bKash, submit your transaction ID, and your account unlocks as soon as we confirm it. If a payment lapses, your storefront stays live during a grace period." },
      { icon: "", title: "Can the assistant change things in my account?", text: "Only a small set of low-risk actions, and only with your explicit confirmation. It has no database access and can only see your own business." },
    ],
  },
};

function mergeStructural(defaults: StructuralContent, row: { seo_title?: string | null; seo_description?: string | null; content?: unknown } | null): StructuralContent {
  if (!row) return defaults;
  const c = (row.content ?? {}) as Partial<StructuralContent>;
  return {
    seoTitle: row.seo_title || defaults.seoTitle,
    seoDescription: row.seo_description || defaults.seoDescription,
    badge: c.badge ?? defaults.badge,
    title: c.title || defaults.title,
    titleHighlight: c.titleHighlight ?? defaults.titleHighlight,
    subtitle: c.subtitle ?? defaults.subtitle,
    itemsTitle: c.itemsTitle ?? defaults.itemsTitle,
    items: c.items && c.items.length ? c.items : defaults.items,
    items2Title: c.items2Title ?? defaults.items2Title,
    items2: c.items2 && c.items2.length ? c.items2 : defaults.items2,
    bodyTitle: c.bodyTitle ?? defaults.bodyTitle,
    body: c.body ?? defaults.body,
    ctaEnabled: c.ctaEnabled ?? defaults.ctaEnabled,
    ctaTitle: c.ctaTitle ?? defaults.ctaTitle,
    ctaSubtitle: c.ctaSubtitle ?? defaults.ctaSubtitle,
  };
}

export const getStructuralPage = unstable_cache(
  async (slug: StructuralSlug): Promise<StructuralContent> => {
    const db = getAdminSupabase();
    const { data } = await db
      .from("platform_pages")
      .select("seo_title, seo_description, content")
      .eq("slug", slug)
      .eq("kind", "structural")
      .maybeSingle();
    return mergeStructural(STRUCTURAL_DEFAULTS[slug], data);
  },
  ["structural-page"],
  { revalidate: 300, tags: ["website-pages"] },
);

export async function getAllStructuralPages(): Promise<
  { slug: StructuralSlug; label: string; route: string; title: string; updatedAt: string | null }[]
> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_pages").select("slug, seo_title, content, updated_at").eq("kind", "structural");
  const stored = new Map((data ?? []).map((r) => [r.slug as string, r]));
  return STRUCTURAL_SLUGS.map((slug) => {
    const row = stored.get(slug);
    const content = mergeStructural(STRUCTURAL_DEFAULTS[slug], row ?? null);
    return {
      slug,
      label: STRUCTURAL_META[slug].label,
      route: STRUCTURAL_META[slug].route,
      title: content.title,
      updatedAt: (row?.updated_at as string) ?? null,
    };
  });
}

export async function setStructuralPage(slug: StructuralSlug, content: StructuralContent, adminId: string) {
  const db = getAdminSupabase();
  await db.from("platform_pages").upsert(
    {
      slug,
      kind: "structural",
      status: "published",
      title: content.title.slice(0, 200),
      body: "",
      seo_title: content.seoTitle.slice(0, 200),
      seo_description: content.seoDescription.slice(0, 500),
      content,
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slug" },
  );
  revalidateTag("website-pages");
}

// ---------------- Custom pages (privacy/terms/refund/faq + admin-created) ----------------

export interface CustomPage {
  slug: string;
  title: string;
  body: string;
  status: "draft" | "published";
  seoTitle: string;
  seoDescription: string;
  showInNav: boolean;
  navLabel: string;
  locked: boolean;
  route: string;
  updatedAt: string | null;
}

/** Legacy legal/FAQ pages — fixed historic routes, can't be deleted or unpublished. */
export const LOCKED_CUSTOM_ROUTES: Record<string, string> = {
  privacy: "/privacy-policy",
  terms: "/terms",
  refund: "/refund-policy",
  faq: "/faq",
};

export const CUSTOM_DEFAULTS: Record<string, { title: string; body: string }> = {
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

function customRoute(slug: string): string {
  return LOCKED_CUSTOM_ROUTES[slug] ?? `/p/${slug}`;
}

/** Keep a page's "show in header nav" toggle in sync with a real platform_nav_links row. */
async function syncCustomPageNav(route: string, showInNav: boolean, navLabel: string) {
  const header = await getAllNavLinks("header");
  const existing = header.find((l) => l.href === route);
  if (showInNav && !existing) {
    await createNavLink({ location: "header", section: "secondary", label: navLabel || route, href: route, icon: "FileText" });
  } else if (!showInNav && existing) {
    await deleteNavLink(existing.id);
  } else if (showInNav && existing && navLabel && existing.label !== navLabel) {
    // label changed on the page — the nav link keeps its own label once created, so leave it;
    // the admin can rename it directly under Navigation if desired.
  }
}

function rowToCustomPage(slug: string, row: Record<string, unknown> | null): CustomPage {
  const def = CUSTOM_DEFAULTS[slug];
  return {
    slug,
    title: (row?.title as string) || def?.title || slug,
    body: (row?.body as string) ?? def?.body ?? "",
    status: (row?.status as "draft" | "published") ?? "published",
    seoTitle: (row?.seo_title as string) ?? "",
    seoDescription: (row?.seo_description as string) ?? "",
    showInNav: !!row?.show_in_nav,
    navLabel: (row?.nav_label as string) ?? "",
    locked: slug in LOCKED_CUSTOM_ROUTES,
    route: customRoute(slug),
    updatedAt: (row?.updated_at as string) ?? null,
  };
}

/** Public lookup — only returns a page if it exists and is published (legacy legal pages always count as published even before their first edit). */
export const getPublishedCustomPage = unstable_cache(
  async (slug: string): Promise<CustomPage | null> => {
    const db = getAdminSupabase();
    const { data } = await db.from("platform_pages").select("*").eq("slug", slug).eq("kind", "custom").maybeSingle();
    if (!data && !(slug in CUSTOM_DEFAULTS)) return null;
    const page = rowToCustomPage(slug, data ?? null);
    return page.status === "published" ? page : null;
  },
  ["custom-page"],
  { revalidate: 300, tags: ["website-pages"] },
);

/** Admin lookup — returns drafts too. */
export async function getCustomPageForAdmin(slug: string): Promise<CustomPage | null> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_pages").select("*").eq("slug", slug).eq("kind", "custom").maybeSingle();
  if (!data && !(slug in CUSTOM_DEFAULTS)) return null;
  return rowToCustomPage(slug, data ?? null);
}

export async function getAllCustomPages(): Promise<CustomPage[]> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_pages").select("*").eq("kind", "custom");
  const stored = new Map((data ?? []).map((r) => [r.slug as string, r]));
  const slugs = new Set([...Object.keys(CUSTOM_DEFAULTS), ...stored.keys()]);
  return [...slugs]
    .map((slug) => rowToCustomPage(slug, stored.get(slug) ?? null))
    .sort((a, b) => (a.locked === b.locked ? a.title.localeCompare(b.title) : a.locked ? -1 : 1));
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$/;
const RESERVED_CUSTOM_SLUGS = new Set(["s", "app", "admin", "api", ...STRUCTURAL_SLUGS, ...Object.keys(LOCKED_CUSTOM_ROUTES)]);

export function validCustomSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_CUSTOM_SLUGS.has(slug);
}

export async function createCustomPage(input: {
  slug: string;
  title: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  status: "draft" | "published";
  showInNav: boolean;
  navLabel: string;
  adminId: string;
}): Promise<{ ok: true } | { error: string }> {
  if (!validCustomSlug(input.slug)) return { error: "Slug must be lowercase letters, numbers and hyphens, and not a reserved word." };
  if (!input.title.trim()) return { error: "Title is required." };
  const db = getAdminSupabase();
  const { data: existing } = await db.from("platform_pages").select("slug").eq("slug", input.slug).maybeSingle();
  if (existing) return { error: "That URL is already in use." };
  await db.from("platform_pages").insert({
    slug: input.slug,
    kind: "custom",
    status: input.status,
    title: input.title.slice(0, 200),
    body: input.body.slice(0, 40000),
    seo_title: input.seoTitle.slice(0, 200),
    seo_description: input.seoDescription.slice(0, 500),
    show_in_nav: input.showInNav,
    nav_label: input.navLabel.slice(0, 60),
    updated_by: input.adminId,
    updated_at: new Date().toISOString(),
  });
  if (input.showInNav) await syncCustomPageNav(customRoute(input.slug), true, input.navLabel || input.title);
  revalidateTag("website-pages");
  revalidateTag("website-nav");
  return { ok: true };
}

export async function updateCustomPage(
  slug: string,
  patch: Partial<{
    title: string;
    body: string;
    seoTitle: string;
    seoDescription: string;
    status: "draft" | "published";
    showInNav: boolean;
    navLabel: string;
  }>,
  adminId: string,
): Promise<{ ok: true } | { error: string }> {
  if (patch.title !== undefined && !patch.title.trim()) return { error: "Title is required." };
  const db = getAdminSupabase();
  const update: Record<string, unknown> = { updated_by: adminId, updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title.slice(0, 200);
  if (patch.body !== undefined) update.body = patch.body.slice(0, 40000);
  if (patch.seoTitle !== undefined) update.seo_title = patch.seoTitle.slice(0, 200);
  if (patch.seoDescription !== undefined) update.seo_description = patch.seoDescription.slice(0, 500);
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.showInNav !== undefined) update.show_in_nav = patch.showInNav;
  if (patch.navLabel !== undefined) update.nav_label = patch.navLabel.slice(0, 60);

  const { data: existing } = await db.from("platform_pages").select("slug").eq("slug", slug).maybeSingle();
  if (existing) {
    await db.from("platform_pages").update(update).eq("slug", slug);
  } else {
    const def = CUSTOM_DEFAULTS[slug];
    if (!def) return { error: "Unknown page." };
    await db.from("platform_pages").insert({ slug, kind: "custom", status: "published", title: def.title, body: def.body, ...update });
  }
  if (patch.showInNav !== undefined) {
    const label = patch.navLabel ?? patch.title ?? slug;
    await syncCustomPageNav(customRoute(slug), patch.showInNav, label);
    revalidateTag("website-nav");
  }
  revalidateTag("website-pages");
  return { ok: true };
}

export async function deleteCustomPage(slug: string): Promise<{ ok: true } | { error: string }> {
  if (slug in LOCKED_CUSTOM_ROUTES) return { error: "This page can't be deleted." };
  const db = getAdminSupabase();
  await db.from("platform_pages").delete().eq("slug", slug).eq("kind", "custom");
  await syncCustomPageNav(customRoute(slug), false, "");
  revalidateTag("website-pages");
  revalidateTag("website-nav");
  return { ok: true };
}
