import { unstable_cache } from "next/cache";
import { getDomainSettings } from "@/lib/platform-settings";

/**
 * Live USD→BDT rate from a free, keyless, no-rate-limit currency feed
 * (daily-updated, jsdelivr-hosted, with a documented pages.dev fallback).
 * No SLA is published for either host, so the admin's hand-typed
 * `domain_usd_to_bdt_rate` setting stays as the safety net if both fail.
 */

const PRIMARY = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const FALLBACK_CDN = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";

export interface FxRate {
  rate: number;
  source: "live" | "fallback";
}

export const getLiveUsdToBdtRate = unstable_cache(
  async (): Promise<FxRate> => {
    for (const url of [PRIMARY, FALLBACK_CDN]) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const rate = json?.usd?.bdt;
          if (typeof rate === "number" && rate > 0) return { rate, source: "live" };
        }
      } catch {
        /* try the next host */
      }
    }
    const settings = await getDomainSettings();
    return { rate: settings.usdToBdtRate, source: "fallback" };
  },
  ["usd-bdt-rate"],
  { revalidate: 21600 }, // 6h — the underlying feed itself is only updated daily
);
