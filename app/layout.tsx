import type { Metadata } from "next";
import "./globals.css";
import { sans } from "@/lib/fonts";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import ConditionalLayout from "@/components/ConditionalLayout";
import { getPublicTracking } from "@/lib/platform-settings";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Zotomic — See. Understand. Act.",
    template: "%s — Zotomic",
  },
  description:
    "Zotomic turns your business data into clear weekly intelligence — and clarity into action. Reports, a universal storefront, and an AI assistant for small businesses.",
  applicationName: "Zotomic",
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Zotomic",
    title: "Zotomic — See. Understand. Act.",
    description: "Business intelligence, without the complexity.",
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tracking = await getPublicTracking();
  return (
    <html lang="en" suppressHydrationWarning className={sans.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#f1f5f9" />
      </head>
      <body className="min-h-screen bg-app text-fg antialiased">
        <ThemeProvider>
          <ToastProvider>
            <ConditionalLayout tracking={tracking}>{children}</ConditionalLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
