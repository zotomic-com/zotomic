"use client";

import { useEffect } from "react";
import { writeCart } from "./cart-store";

export function ClearCartOnMount({ storeSlug }: { storeSlug: string }) {
  useEffect(() => {
    writeCart(storeSlug, []);
  }, [storeSlug]);
  return null;
}
