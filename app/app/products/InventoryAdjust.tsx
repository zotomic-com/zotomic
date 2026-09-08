"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { adjustInventory, setStockTracking } from "./variant-actions";

const REASONS = ["recount", "restock", "damage", "theft", "correction", "return", "other"];

export function InventoryAdjust({
  productId,
  variantId,
  currentStock,
  tracked = true,
  canStopTracking = false,
  onDone,
}: {
  productId: string;
  variantId?: string;
  currentStock: number;
  tracked?: boolean;
  canStopTracking?: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"set" | "adjust">("set");
  const [setVal, setSetVal] = useState(String(currentStock));
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("recount");
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<{ error?: string; ok?: boolean; balance?: number }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast(res.error, "error");
      else {
        toast(res.balance != null ? `Stock updated → ${res.balance}` : "Saved", "success");
        setDelta("");
        setNote("");
        onDone();
      }
    });

  const save = () =>
    run(() =>
      mode === "set"
        ? adjustInventory({ productId, variantId: variantId ?? null, mode: "set", amount: Number(setVal), reason, note })
        : adjustInventory({ productId, variantId: variantId ?? null, mode: "adjust", amount: Number(delta), reason: reason === "recount" ? "restock" : reason, note }),
    );

  const bump = (n: number) =>
    run(() => adjustInventory({ productId, variantId: variantId ?? null, mode: "adjust", amount: n, reason: "correction", note: "" }));

  return (
    <div className="space-y-3 rounded-sm border border-border bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-fg-muted">
          Update stock <span className="font-normal text-fg-subtle">(now {currentStock})</span>
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => bump(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-fg-muted hover:text-fg disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => bump(1)}
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-fg-muted hover:text-fg disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-1">
        {(["set", "adjust"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              mode === m ? "border-primary bg-primary-soft text-primary" : "border-border text-fg-muted"
            }`}
          >
            {m === "set" ? "Set to exact number" : "Add / remove"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {mode === "set" ? (
          <Input
            type="number"
            min="0"
            className="w-28"
            placeholder="New total"
            value={setVal}
            onChange={(e) => setSetVal(e.target.value)}
          />
        ) : (
          <Input
            type="number"
            className="w-28"
            placeholder="+10 or -3"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
        )}
        <Select value={reason} onChange={(e) => setReason(e.target.value)} className="w-32">
          {REASONS.map((r) => (
            <option key={r} value={r} className="capitalize">
              {r}
            </option>
          ))}
        </Select>
        <Input
          className="min-w-[8rem] flex-1"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" onClick={save} disabled={pending || (mode === "set" ? setVal === "" : !delta)}>
          {pending ? "…" : "Save"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs">
        <button
          type="button"
          disabled={pending || currentStock <= 0}
          onClick={() =>
            run(() =>
              adjustInventory({ productId, variantId: variantId ?? null, mode: "set", amount: 0, reason: "correction", note: "Marked out of stock" }),
            )
          }
          className="font-semibold text-danger hover:underline disabled:opacity-40"
        >
          Mark out of stock
        </button>

        {canStopTracking && !variantId && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setStockTracking(productId, !tracked))}
            className="ml-auto font-semibold text-fg-muted hover:text-fg disabled:opacity-40"
          >
            {tracked ? "Stop tracking stock" : "Start tracking stock"}
          </button>
        )}
      </div>
    </div>
  );
}
