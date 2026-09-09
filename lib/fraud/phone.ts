/** Normalize a Bangladeshi phone to its 10-digit local form (1XXXXXXXXX). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("880")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  d = d.slice(-10);
  return d.length >= 9 ? d : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export const STAGE_LABEL: Record<number, string> = { 1: "Watch", 2: "Suspect", 3: "Blacklist" };

export const CATEGORY_LABEL: Record<string, string> = {
  cancellations: "High cancellations",
  returns: "High returns / refunds",
  delivery_failures: "Failed deliveries",
  cross_store: "Repeat offender across stores",
  chargeback: "Payment chargeback",
  abuse: "Abuse",
  reported: "Reported by a store",
  other: "Other",
};
