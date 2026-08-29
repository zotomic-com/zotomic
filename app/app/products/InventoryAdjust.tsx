"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { adjustInventory } from "./variant-actions";

const REASONS = ["recount", "restock", "damage", "theft", "correction", "return", "other"];

export function InventoryAdjust({
  productId,
  variantId,
  currentStock,
  onDone,
}: {
  productId: string;
  variantId?: string;
  currentStock: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("restock");
  const [note, setNote] = useState("");

  const apply = () =>
    start(async () => {
      const res = await adjustInventory({
        productId,
        variantId: variantId ?? null,
        delta: Number(qty),
        reason,
        note,
      });
      if ("error" in res) toast(res.error, "error");
      else {
        toast(`Stock updated → ${res.balance}`, "success");
        setQty("");
        setNote("");
        onDone();
      }
    });

  return (
    <div className="rounded-sm border border-border bg-surface-2 p-3">
      <p className="text-xs font-semibold text-fg-muted">
        Adjust stock <span className="font-normal text-fg-subtle">(now {currentStock})</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          type="number"
          className="w-24"
          placeholder={reason === "recount" ? "New total" : "+/- qty"}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Select value={reason} onChange={(e) => setReason(e.target.value)} className="w-32">
          {REASONS.map((r) => (
            <option key={r} value={r} className="capitalize">
              {r}
            </option>
          ))}
        </Select>
        <Input
          className="flex-1"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" onClick={apply} disabled={pending || !qty}>
          {pending ? "…" : "Apply"}
        </Button>
      </div>
    </div>
  );
}
