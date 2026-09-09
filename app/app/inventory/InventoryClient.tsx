"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ListToolbar } from "@/components/app/ListToolbar";
import { BulkBar } from "@/components/app/BulkBar";
import { InventoryAdjust } from "../products/InventoryAdjust";
import { bulkMarkOutOfStock } from "../products/variant-actions";

export interface StockRow {
  key: string;
  productId: string;
  variantId: string | null;
  label: string;
  sku: string;
  stock: number;
  tracked: boolean;
  buyingPrice: number | null;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "low", label: "Low" },
  { value: "out", label: "Out" },
  { value: "instock", label: "In stock" },
  { value: "untracked", label: "Not tracked" },
];

export function InventoryClient({
  rows,
  lowThreshold,
  currency,
}: {
  rows: StockRow[];
  lowThreshold: number;
  currency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (t && !r.label.toLowerCase().includes(t) && !r.sku.toLowerCase().includes(t)) return false;
      if (filter === "low") return r.tracked && r.stock > 0 && r.stock <= lowThreshold;
      if (filter === "out") return r.tracked && r.stock <= 0;
      if (filter === "instock") return r.tracked && r.stock > lowThreshold;
      if (filter === "untracked") return !r.tracked;
      return true;
    });
  }, [rows, q, filter, lowThreshold]);

  const counts = {
    all: rows.length,
    low: rows.filter((r) => r.tracked && r.stock > 0 && r.stock <= lowThreshold).length,
    out: rows.filter((r) => r.tracked && r.stock <= 0).length,
    instock: rows.filter((r) => r.tracked && r.stock > lowThreshold).length,
    untracked: rows.filter((r) => !r.tracked).length,
  };

  const toggle = (k: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const markOut = () =>
    start(async () => {
      const items = rows.filter((r) => sel.has(r.key)).map((r) => ({ productId: r.productId, variantId: r.variantId }));
      const res = await bulkMarkOutOfStock(items);
      if ("error" in res) return toast(res.error, "error");
      toast(`${res.count} item(s) set to 0`, "success");
      setSel(new Set());
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <ListToolbar
        search={q}
        onSearch={setQ}
        searchPlaceholder="Search item or SKU…"
        filters={[
          {
            key: "state",
            value: filter,
            onChange: setFilter,
            options: FILTERS.map((f) => ({ ...f, count: counts[f.value as keyof typeof counts] })),
          },
        ]}
      />

      <div className="card">
        <ul className="divide-y divide-border">
          {shown.map((r) => (
            <li key={r.key} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label="Select"
                  checked={sel.has(r.key)}
                  onChange={() => toggle(r.key)}
                  className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{r.label}</p>
                  <p className="text-xs text-fg-subtle">
                    {r.sku ? `${r.sku} · ` : ""}
                    {r.buyingPrice != null ? `value ${money(Math.max(0, r.stock) * r.buyingPrice, currency)}` : "no buying price"}
                  </p>
                </div>
                {!r.tracked ? (
                  <Badge tone="neutral">not tracked</Badge>
                ) : r.stock <= 0 ? (
                  <Badge tone="danger">out</Badge>
                ) : r.stock <= lowThreshold ? (
                  <Badge tone="warning">low</Badge>
                ) : null}
                <span className="w-12 text-right text-sm font-semibold text-fg">{r.stock}</span>
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.key ? null : r.key)}>
                  {open === r.key ? "Close" : "Adjust"}
                </Button>
                <Link
                  href={`/app/products/${r.productId}`}
                  className="text-fg-subtle hover:text-primary"
                  aria-label="Open product"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              {open === r.key && (
                <div className="mt-2">
                  <InventoryAdjust
                    productId={r.productId}
                    variantId={r.variantId ?? undefined}
                    currentStock={r.stock}
                    tracked={r.tracked}
                    canStopTracking={!r.variantId}
                    onDone={() => {
                      setOpen(null);
                      router.refresh();
                    }}
                  />
                </div>
              )}
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-fg-subtle">Nothing matches these filters.</li>
          )}
        </ul>
      </div>

      <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
        <Button size="sm" variant="outline" disabled={pending} onClick={markOut}>
          Mark out of stock
        </Button>
      </BulkBar>
    </div>
  );
}
