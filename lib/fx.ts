/**
 * Live USD→BDT rate for the marketing module (item 10). Free, no-key source
 * (open.er-api.com), cached 24h. On failure we fall back to the last value and
 * flag it so the UI/report can say the rate is stale.
 */
import { unstable_cache } from "next/cache";

const FALLBACK_USD_BDT = 118; // last-resort if the API has never succeeded

export interface FxRate {
  usdToBdt: number;
  fetchedAt: string;
  stale: boolean;
}

const load = unstable_cache(
  async (): Promise<FxRate> => {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 86_400 },
      });
      const data = await res.json();
      const rate = Number(data?.rates?.BDT);
      if (rate && rate > 0) {
        return { usdToBdt: Math.round(rate * 10000) / 10000, fetchedAt: new Date().toISOString(), stale: false };
      }
    } catch {
      /* fall through */
    }
    return { usdToBdt: FALLBACK_USD_BDT, fetchedAt: new Date().toISOString(), stale: true };
  },
  ["fx-usd-bdt"],
  { revalidate: 86_400, tags: ["fx-rate"] },
);

export function getUsdToBdt(): Promise<FxRate> {
  return load();
}

export function usdToBdt(usd: number, rate: number): number {
  return Math.round(usd * rate);
}
