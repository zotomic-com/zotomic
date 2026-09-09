"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import type { CustomerOrderSummary } from "@/lib/storefront/customer-orders";
import { StatusBadge } from "./StatusBadge";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const ACTIVE = ["pending", "confirmed", "processing", "shipped"];

export function OrdersList({
  basePath,
  orders,
  initialFilter,
}: {
  basePath: string;
  orders: CustomerOrderSummary[];
  initialFilter: string;
}) {
  const [filter, setFilter] = useState(
    FILTERS.some((f) => f.key === initialFilter) ? initialFilter : "all",
  );

  const shown = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "active") return ACTIVE.includes(o.status);
    if (filter === "delivered") return o.status === "delivered";
    if (filter === "cancelled") return o.status === "cancelled" || o.status === "returned";
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.key
                ? "border-[var(--sf-accent)] bg-[var(--sf-accent-soft)] text-[var(--sf-accent)]"
                : "border-[var(--sf-line)] text-[var(--sf-muted)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[var(--sf-radius-lg)] border border-dashed border-[var(--sf-line)] p-8 text-center text-sm text-[var(--sf-muted)]">
          {orders.length === 0 ? "No orders yet." : "No orders in this view."}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((o) => (
            <li key={o.number}>
              <Link
                href={`${basePath}/account/orders/${o.number}`}
                className="flex items-center gap-3 rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-3 transition-colors hover:border-[var(--sf-accent)]"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-card)]">
                  {o.thumb && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={cldUrl(o.thumb, 160)} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{o.titleLine}</p>
                    <span className="shrink-0 text-sm font-semibold">{money(o.total, o.currency)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--sf-muted)]">
                    #{o.number} · {fmtDate(o.placedAt)} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                  </p>
                  <div className="mt-1.5">
                    <StatusBadge status={o.status} />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--sf-muted)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
