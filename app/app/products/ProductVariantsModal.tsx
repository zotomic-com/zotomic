"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { saveVariants, type OptionDef, type VariantInput } from "./variant-actions";

export interface VariantRow {
  id: string;
  name: string;
  options: Record<string, string>;
  sku: string | null;
  price: number | null;
  sale_price: number | null;
  buying_price: number | null;
  stock_qty: number;
  active: boolean;
}

type Draft = VariantInput & { key: string };

function cartesian(options: OptionDef[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>(
    (acc, opt) =>
      acc.flatMap((combo) => opt.values.map((v) => ({ ...combo, [opt.name]: v }))),
    [{}],
  );
}

export function ProductVariantsModal({
  open,
  onClose,
  productId,
  productName,
  currency,
  initialOptions,
  initialVariants,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  currency: string;
  initialOptions: OptionDef[];
  initialVariants: VariantRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [options, setOptions] = useState<OptionDef[]>(
    initialOptions.length ? initialOptions : [{ name: "", values: [] }],
  );
  const [rows, setRows] = useState<Draft[]>(
    initialVariants.map((v) => ({
      key: v.id,
      id: v.id,
      name: v.name,
      options: v.options ?? {},
      sku: v.sku ?? "",
      price: v.price,
      sale_price: v.sale_price,
      buying_price: v.buying_price,
      stock_qty: v.stock_qty,
      active: v.active,
    })),
  );

  const cleanOptions = useMemo(
    () =>
      options
        .map((o) => ({ name: o.name.trim(), values: o.values.map((v) => v.trim()).filter(Boolean) }))
        .filter((o) => o.name && o.values.length),
    [options],
  );

  const setOption = (i: number, patch: Partial<OptionDef>) =>
    setOptions((o) => o.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const generate = () => {
    if (!cleanOptions.length) return toast("Add at least one option with values.", "error");
    const combos = cartesian(cleanOptions);
    if (combos.length > 200) return toast("That would create more than 200 variants.", "error");
    setRows((prev) => {
      const byKey = new Map(prev.map((r) => [Object.values(r.options).join("|"), r]));
      return combos.map((combo) => {
        const k = Object.values(combo).join("|");
        const existing = byKey.get(k);
        return (
          existing ?? {
            key: `new-${k}`,
            name: Object.values(combo).join(" / "),
            options: combo,
            sku: "",
            price: null,
            sale_price: null,
            buying_price: null,
            stock_qty: 0,
            active: true,
          }
        );
      });
    });
  };

  const setRow = (i: number, patch: Partial<Draft>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = () =>
    start(async () => {
      const res = await saveVariants(
        productId,
        cleanOptions,
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          options: r.options,
          sku: r.sku || undefined,
          price: r.price,
          sale_price: r.sale_price,
          buying_price: r.buying_price,
          stock_qty: Number(r.stock_qty) || 0,
          active: r.active,
        })),
      );
      if ("error" in res) toast(res.error, "error");
      else {
        toast(res.count ? `${res.count} variants saved` : "Variants cleared", "success");
        onClose();
        router.refresh();
      }
    });

  const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

  return (
    <Modal open={open} onClose={onClose} title={`Variants — ${productName}`} size="lg">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-fg-muted">Options</p>
          <p className="mb-2 text-xs text-fg-subtle">
            e.g. Colour = Red, Blue · Size = S, M, L. Enter values comma-separated.
          </p>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="w-32"
                  placeholder="Option"
                  value={o.name}
                  onChange={(e) => setOption(i, { name: e.target.value })}
                />
                <Input
                  className="flex-1"
                  placeholder="Red, Blue, Green"
                  value={o.values.join(", ")}
                  onChange={(e) => setOption(i, { values: e.target.value.split(",").map((v) => v.trimStart()) })}
                />
                <button
                  onClick={() => setOptions((x) => x.filter((_, j) => j !== i))}
                  className="text-fg-subtle hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOptions((o) => [...o, { name: "", values: [] }])}>
              <Plus className="h-4 w-4" /> Option
            </Button>
            <Button size="sm" variant="outline" onClick={generate}>
              <Wand2 className="h-4 w-4" /> Generate variants
            </Button>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-fg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left">Variant</th>
                  <th className="px-2 py-1.5 text-left">SKU</th>
                  <th className="px-2 py-1.5 text-right">Price ({currency})</th>
                  <th className="px-2 py-1.5 text-right">Buying</th>
                  <th className="px-2 py-1.5 text-right">Stock</th>
                  <th className="px-2 py-1.5 text-center">On</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="px-2 py-1 font-medium text-fg">{r.name}</td>
                    <td className="px-2 py-1">
                      <input
                        className="w-24 rounded border border-border bg-surface px-1.5 py-1"
                        value={r.sku ?? ""}
                        onChange={(e) => setRow(i, { sku: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        className="w-20 rounded border border-border bg-surface px-1.5 py-1 text-right"
                        placeholder="inherit"
                        value={num(r.price)}
                        onChange={(e) => setRow(i, { price: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        className="w-20 rounded border border-border bg-surface px-1.5 py-1 text-right"
                        value={num(r.buying_price)}
                        onChange={(e) =>
                          setRow(i, { buying_price: e.target.value === "" ? null : Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        className="w-16 rounded border border-border bg-surface px-1.5 py-1 text-right"
                        value={String(r.stock_qty ?? 0)}
                        onChange={(e) => setRow(i, { stock_qty: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={r.active !== false}
                        onChange={(e) => setRow(i, { active: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setRows([]);
              setOptions([{ name: "", values: [] }]);
            }}
            className="text-xs text-danger hover:underline"
          >
            Clear all variants
          </button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save variants"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
