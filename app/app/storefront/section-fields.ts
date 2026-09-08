import type { SectionType } from "@/lib/storefront/config";

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "url" | "bool" | "images" | "select";
  options?: { value: string; label: string }[];
}

/** Editable fields per section type (list-type data like FAQ items is edited as JSON textarea). */
export const SECTION_FIELDS: Record<SectionType, FieldDef[]> = {
  hero: [
    { key: "tag", label: "Tag pill (optional)", type: "text" },
    { key: "heading", label: "Heading", type: "text" },
    { key: "subheading", label: "Subheading", type: "text" },
    { key: "ctaLabel", label: "Button label", type: "text" },
    { key: "ctaHref", label: "Button link", type: "text" },
    {
      key: "style",
      label: "Desktop layout (mobile always uses the card)",
      type: "select",
      options: [
        { value: "full", label: "Full-width background" },
        { value: "card", label: "Banner card + side image" },
      ],
    },
    {
      key: "tone",
      label: "Card colour",
      type: "select",
      options: [
        { value: "surface", label: "Neutral" },
        { value: "dark", label: "Dark" },
        { value: "accent", label: "Accent (solid)" },
      ],
    },
    { key: "images", label: "Banner images", type: "images" },
  ],
  featured_products: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "limit", label: "How many products", type: "number" },
  ],
  product_grid: [{ key: "heading", label: "Heading", type: "text" }],
  category_grid: [{ key: "heading", label: "Heading", type: "text" }],
  image_text: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "body", label: "Body", type: "textarea" },
    { key: "imageUrl", label: "Image URL", type: "url" },
    { key: "flip", label: "Image on left", type: "bool" },
  ],
  rich_text: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "body", label: "Body", type: "textarea" },
  ],
  testimonials: [{ key: "heading", label: "Heading", type: "text" }],
  faq: [{ key: "heading", label: "Heading", type: "text" }],
  logo_strip: [{ key: "heading", label: "Heading", type: "text" }],
  newsletter: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "subheading", label: "Subheading", type: "text" },
  ],
  contact: [{ key: "heading", label: "Heading", type: "text" }],
};
