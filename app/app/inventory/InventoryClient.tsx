"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InventoryAdjust } from "../products/InventoryAdjust";

export interface StockRow {
  key: string;
  productId: string;
  variantId: string | null;
  label: string;
  sku: string;
  stock: number;
  tracked: boolean;
}

export function InventoryClient({ rows, lowThreshold }: { rows: StockRow[]; lowThreshold: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = rows.filter(
    (r) => r.label.toLowerCase().includes(q.toLowerCase()) || r.sku.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <Card className="p-0">
      <div className="border-b border-border p-3">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stock…" className="pl-9" />
        </div>
      </div>
      <ul className="divide-y divide-border">
        {filtered.map((r) => (
          <li key={r.key} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{r.label}</p>
                {r.sku && <p className="text-xs text-fg-subtle">{r.sku}</p>}
              </div>
              {!r.tracked ? (
                <Badge tone="neutral">not tracked</Badge>
              ) : r.stock <= 0 ? (
                <Badge tone="danger">out</Badge>
              ) : r.stock <= lowThreshold ? (
                <Badge tone="warning">low</Badge>
              ) : null}
              <span className="w-14 text-right text-sm font-semibold text-fg">{r.stock}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpen(open === r.key ? null : r.key)}
              >
                Adjust
              </Button>
            </div>
            {open === r.key && (
              <div className="mt-2">
                <InventoryAdjust
                  productId={r.productId}
                  variantId={r.variantId ?? undefined}
                  currentStock={r.stock}
                  onDone={() => {
                    setOpen(null);
                    router.refresh();
                  }}
                />
              </div>
            )}
          </li>
        ))}
        {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-fg-subtle">Nothing matches.</li>}
      </ul>
    </Card>
  );
}
