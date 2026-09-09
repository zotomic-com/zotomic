"use client";

import { useEffect, useState } from "react";

export interface LineStock {
  stock: number;
  tracked: boolean;
}

/** Fetch current stock for a set of product / variant ids. */
export function useLineStock(storeSlug: string, ids: string[]): Record<string, LineStock> {
  const [map, setMap] = useState<Record<string, LineStock>>({});
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");

  useEffect(() => {
    if (!key) {
      setMap({});
      return;
    }
    let alive = true;
    fetch(`/api/storefront/stock?store=${encodeURIComponent(storeSlug)}&ids=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : { stock: {} }))
      .then((d) => alive && setMap(d.stock ?? {}))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [storeSlug, key]);

  return map;
}

/** "Only N left" / "Out of stock" / over-cart warning for one cart line. */
export function StockLine({ info, qty }: { info?: LineStock; qty: number }) {
  if (!info || !info.tracked) return null;
  if (info.stock <= 0) {
    return <p className="mt-0.5 text-xs font-semibold text-red-600">Out of stock</p>;
  }
  if (qty > info.stock) {
    return (
      <p className="mt-0.5 text-xs font-semibold text-red-600">
        Only {info.stock} available — reduce the quantity
      </p>
    );
  }
  if (info.stock <= 5) {
    return <p className="mt-0.5 text-xs font-semibold text-red-600">Only {info.stock} left</p>;
  }
  return null;
}
