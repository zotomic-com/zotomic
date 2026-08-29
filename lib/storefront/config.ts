/**
 * StorefrontConfig — the single source of truth for a tenant storefront.
 * One universal theme, fully driven by this object. Stored as JSON in
 * storefront_config.draft_json / published_json.
 *
 * No Zod — configs are owner-authored through constrained forms. `normalizeConfig`
 * deep-merges any stored partial onto DEFAULT_CONFIG so the renderer always gets
 * a complete, safe object.
 */

export type SectionType =
  | "hero"
  | "featured_products"
  | "product_grid"
  | "category_grid"
  | "image_text"
  | "rich_text"
  | "testimonials"
  | "faq"
  | "logo_strip"
  | "newsletter"
  | "contact";

export interface Section {
  id: string;
  type: SectionType;
  enabled: boolean;
  data: Record<string, unknown>;
}

export interface StorefrontConfig {
  version: 1;
  brand: {
    storeName: string;
    tagline: string;
    logoUrl: string | null;
    accent: string; // hex
    theme: "light" | "dark";
    font: "inter" | "manrope" | "lora" | "poppins";
    radius: "sharp" | "soft" | "round";
  };
  announcement: { enabled: boolean; text: string; href: string };
  nav: { label: string; href: string }[];
  sections: Section[];
  footer: {
    columns: { title: string; links: { label: string; href: string }[] }[];
    showPaymentBadges: boolean;
    note: string;
  };
  contact: {
    address: string;
    phone: string;
    whatsapp: string;
    email: string;
    hours: string;
    mapEmbedUrl: string;
  };
  social: { facebook: string; instagram: string; youtube: string; tiktok: string };
  commerce: {
    codEnabled: boolean;
    shippingFlatRate: number;
    freeShippingOver: number | null;
    minOrder: number;
  };
  seo: {
    titleSuffix: string;
    description: string;
    ogImageUrl: string | null;
    allowAiCrawlers: boolean;
  };
  tracking: {
    metaPixelId: string;
    ga4MeasurementId: string;
  };
  pages: {
    about: { enabled: boolean; title: string; body: string };
  };
}

export const FONT_STACKS: Record<StorefrontConfig["brand"]["font"], string> = {
  inter: "'Inter', system-ui, sans-serif",
  manrope: "'Manrope', system-ui, sans-serif",
  lora: "'Lora', Georgia, serif",
  poppins: "'Poppins', system-ui, sans-serif",
};

export const RADIUS_PX: Record<StorefrontConfig["brand"]["radius"], string> = {
  sharp: "2px",
  soft: "10px",
  round: "18px",
};

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero banner",
  featured_products: "Featured products",
  product_grid: "All products",
  category_grid: "Shop by category",
  image_text: "Image + text",
  rich_text: "Text block",
  testimonials: "Testimonials",
  faq: "FAQ",
  logo_strip: "Logo strip",
  newsletter: "Newsletter signup",
  contact: "Contact block",
};

let _sid = 0;
const sid = (t: string) => `${t}-${(++_sid).toString(36)}${Date.now().toString(36).slice(-3)}`;

export function defaultSection(type: SectionType): Section {
  const base = { id: sid(type), type, enabled: true };
  switch (type) {
    case "hero":
      return {
        ...base,
        data: {
          heading: "New season, new arrivals",
          subheading: "Quality you can feel, prices you'll like.",
          ctaLabel: "Shop now",
          ctaHref: "/products",
          imageUrl: null,
        },
      };
    case "featured_products":
      return { ...base, data: { heading: "Featured", limit: 4 } };
    case "product_grid":
      return { ...base, data: { heading: "All products" } };
    case "category_grid":
      return { ...base, data: { heading: "Shop by category" } };
    case "image_text":
      return {
        ...base,
        data: { heading: "Made for everyday", body: "A short paragraph about your brand.", imageUrl: null, flip: false },
      };
    case "rich_text":
      return { ...base, data: { heading: "", body: "Tell your story here." } };
    case "testimonials":
      return { ...base, data: { heading: "What customers say", items: [] } };
    case "faq":
      return { ...base, data: { heading: "Questions", items: [{ q: "How long does delivery take?", a: "2–4 days inside the city." }] } };
    case "logo_strip":
      return { ...base, data: { heading: "As seen in", logos: [] } };
    case "newsletter":
      return { ...base, data: { heading: "Get 10% off your first order", subheading: "Join our list." } };
    case "contact":
      return { ...base, data: { heading: "Visit us" } };
  }
}

export function makeDefaultConfig(storeName: string): StorefrontConfig {
  return {
    version: 1,
    brand: {
      storeName,
      tagline: "",
      logoUrl: null,
      accent: "#15803d",
      theme: "light",
      font: "inter",
      radius: "soft",
    },
    announcement: { enabled: false, text: "Free delivery on orders over ৳2000", href: "" },
    nav: [
      { label: "Home", href: "/" },
      { label: "Products", href: "/products" },
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
    sections: [
      defaultSection("hero"),
      defaultSection("featured_products"),
      defaultSection("image_text"),
      defaultSection("product_grid"),
      defaultSection("newsletter"),
    ],
    footer: {
      columns: [
        { title: "Shop", links: [{ label: "All products", href: "/products" }] },
        { title: "Help", links: [{ label: "Contact", href: "/contact" }, { label: "Shipping & returns", href: "/about" }] },
      ],
      showPaymentBadges: true,
      note: "",
    },
    contact: { address: "", phone: "", whatsapp: "", email: "", hours: "", mapEmbedUrl: "" },
    social: { facebook: "", instagram: "", youtube: "", tiktok: "" },
    commerce: { codEnabled: true, shippingFlatRate: 60, freeShippingOver: null, minOrder: 0 },
    seo: {
      titleSuffix: ` — ${storeName}`,
      description: `Shop ${storeName}.`,
      ogImageUrl: null,
      allowAiCrawlers: true,
    },
    tracking: { metaPixelId: "", ga4MeasurementId: "" },
    pages: { about: { enabled: true, title: "About us", body: "" } },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(base) || !isObj(patch)) return (patch ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) {
    if (k in patch) out[k] = deepMerge((base as Record<string, unknown>)[k], patch[k]);
  }
  return out as T;
}

/** Merge a stored partial onto a fresh default so the renderer gets a full object. */
export function normalizeConfig(stored: unknown, storeName: string): StorefrontConfig {
  const def = makeDefaultConfig(storeName);
  if (!isObj(stored)) return def;
  const merged = deepMerge(def, stored);
  // sections/nav/footer.columns are arrays — take stored if it's a valid array
  if (Array.isArray((stored as Record<string, unknown>).sections)) {
    merged.sections = ((stored as Record<string, unknown>).sections as Section[])
      .filter((s) => s && typeof s.type === "string" && s.id)
      .map((s) => ({ ...s, data: isObj(s.data) ? s.data : {} }));
  }
  if (Array.isArray((stored as Record<string, unknown>).nav)) {
    merged.nav = (stored as Record<string, unknown>).nav as StorefrontConfig["nav"];
  }
  return merged;
}
