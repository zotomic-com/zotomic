import { Inter } from "next/font/google";

/**
 * Curated, self-hosted fonts (next/font). One subsetted family for the whole
 * platform. Storefront themes may opt into a second curated face later.
 */
export const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});
