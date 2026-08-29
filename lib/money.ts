const SYMBOLS: Record<string, string> = {
  BDT: "৳",
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  PKR: "₨",
};

export function currencySymbol(code = "BDT"): string {
  return SYMBOLS[code] ?? `${code} `;
}

/** Compact money for cards/tables — rounded, thousands-separated, no decimals. */
export function money(n: number | null | undefined, code = "BDT"): string {
  if (n == null || Number.isNaN(n)) return "—";
  return currencySymbol(code) + Math.round(n).toLocaleString("en-US");
}

/** Signed percentage change, or null when there's no baseline to compare to. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function pluralize(n: number, one: string, many = one + "s"): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
