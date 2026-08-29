"use client";

import { useEffect } from "react";
import Script from "next/script";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Meta Pixel (client). Fires PageView on mount; `pixel.track(...)` for the rest. */
export function MetaPixel({ id }: { id: string }) {
  useEffect(() => {
    if (!id || typeof window === "undefined" || !window.fbq) return;
    window.fbq("track", "PageView");
  }, [id]);

  if (!id) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${id}');fbq('track','PageView');`}
    </Script>
  );
}

/** GA4 gtag (client). */
export function GA4({ id }: { id: string }) {
  if (!id) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  );
}

export const pixel = {
  track(event: string, params?: Record<string, unknown>) {
    if (typeof window !== "undefined" && window.fbq) window.fbq("track", event, params);
    if (typeof window !== "undefined" && window.gtag) window.gtag("event", event.toLowerCase(), params ?? {});
  },
};
