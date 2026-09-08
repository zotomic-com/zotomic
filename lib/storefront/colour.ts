/** Shared option-name detection + colour-swatch resolution for storefront +
 *  the product variant editor. */

export const isColourOpt = (n: string) => /colou?r|shade|colour way|colorway/i.test(n);
export const isSizeOpt = (n: string) => /\bsize\b|\bfit\b/i.test(n);

/** Common colour words → a sensible hex, so owners can type "maroon" / "sky". */
export const COLOUR_HEX: Record<string, string> = {
  black: "#111827",
  white: "#ffffff",
  offwhite: "#f7f7f4",
  cream: "#f5efe0",
  ivory: "#fffff0",
  beige: "#e8dcc0",
  tan: "#d2b48c",
  khaki: "#b7a678",
  brown: "#6b4423",
  chocolate: "#3f2a1d",
  grey: "#9ca3af",
  gray: "#9ca3af",
  silver: "#c0c0c0",
  charcoal: "#374151",
  navy: "#1e293b",
  blue: "#2563eb",
  sky: "#38bdf8",
  teal: "#0d9488",
  green: "#16a34a",
  olive: "#6b7d2f",
  mint: "#a7f3d0",
  lime: "#84cc16",
  yellow: "#facc15",
  mustard: "#d4a017",
  gold: "#d4af37",
  orange: "#f97316",
  peach: "#ffcba4",
  coral: "#ff7f50",
  red: "#dc2626",
  maroon: "#7f1d1d",
  burgundy: "#5b1a1a",
  rust: "#b7410e",
  pink: "#ec4899",
  rose: "#f43f5e",
  blush: "#f7cad0",
  purple: "#9333ea",
  lavender: "#c4b5fd",
  violet: "#7c3aed",
  magenta: "#d946ef",
};

/**
 * Resolve a colour option value to something CSS `background-color` accepts, or
 * null when it clearly isn't a colour. Works on the server (map + hex only) and
 * in the browser (also validates CSS named colours via a probe element).
 */
export function resolveSwatch(value: string): string | null {
  const raw = value.trim();
  const key = raw.toLowerCase().replace(/\s+/g, "");
  if (COLOUR_HEX[key]) return COLOUR_HEX[key];
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw;
  if (/^(rgb|hsl)a?\([\d\s.,%/-]+\)$/i.test(raw)) return raw;
  if (typeof document !== "undefined") {
    const el = document.createElement("span");
    el.style.color = "";
    try {
      el.style.color = raw;
    } catch {
      return null;
    }
    if (el.style.color) return raw;
  }
  return /^[a-z]+$/i.test(raw) ? raw : null;
}
