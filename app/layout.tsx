import type { Metadata } from "next";
import "./globals.css";
import { sans } from "@/lib/fonts";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import ConditionalLayout from "@/components/ConditionalLayout";
import { getPublicTracking, getSiteBranding } from "@/lib/platform-settings";
import { getNavLinks } from "@/lib/site-nav";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getSiteBranding();
  return {
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
    ...(branding.faviconUrl ? { icons: { icon: branding.faviconUrl } } : {}),
    ...(branding.googleSiteVerification ? { verification: { google: branding.googleSiteVerification } } : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [tracking, branding, headerNav, footerNav] = await Promise.all([
    getPublicTracking(),
    getSiteBranding(),
    getNavLinks("header"),
    getNavLinks("footer"),
  ]);

  return (
    <html lang="en" suppressHydrationWarning className={sans.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#f1f5f9" />
      </head>
      <body className="min-h-screen bg-app text-fg antialiased">
        <ThemeProvider>
          <ToastProvider>
            <ConditionalLayout tracking={tracking} branding={branding} headerNav={headerNav} footerNav={footerNav}>
              {children}
            </ConditionalLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
