"use client";

import { useEffect, useRef } from "react";
import { pixel } from "./Pixel";

/** Fire a Meta Pixel / GA4 event once on mount (storefront product view, purchase, …). */
export function TrackEvent({ event, params }: { event: string; params?: Record<string, unknown> }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const t = setTimeout(() => pixel.track(event, params), 400); // let fbevents.js load
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
