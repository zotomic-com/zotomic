"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Plus, Trash2, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { isColourOpt, isSizeOpt, resolveSwatch } from "@/lib/storefront/colour";
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
    (acc, opt) => acc.flatMap((combo) => opt.values.map((v) => ({ ...combo, [opt.name]: v }))),
    [{}],
  );
}

const splitList = (s: string) => [...new Set(s.split(",").map((v) => v.trim()).filter(Boolean))];

export function ProductVariantsModal({
  open,
  onClose,
  productId,
  productName,
  currency,
  plan,
  initialOptions,
  initialVariants,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  currency: string;
  plan: string;
  initialOptions: OptionDef[];
  initialVariants: VariantRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const canColour = plan !== "free";

  const initSize = initialOptions.find((o) => isSizeOpt(o.name));
  const initColour = initialOptions.find((o) => isColourOpt(o.name));

  const [sizes, setSizes] = useState(initSize?.values.join(", ") ?? "");
  const [colours, setColours] = useState<string[]>(initColour?.values ?? []);
  const [advanced, setAdvanced] = useState<OptionDef[]>(
    initialOptions.filter((o) => o !== initSize && o !== initColour),
  );
  const [showAdvanced, setShowAdvanced] = useState(advanced.length > 0);

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

  const cleanOptions = useMemo<OptionDef[]>(() => {
    const out: OptionDef[] = [];
    const sz = splitList(sizes);
    if (sz.length) out.push({ name: "Size", values: sz });
    const cl = [...new Set(colours.map((c) => c.trim()).filter(Boolean))];
    if (canColour && cl.length) out.push({ name: "Colour", values: cl });
    for (const o of advanced) {
      const name = o.name.trim().slice(0, 40);
      const values = [...new Set(o.values.map((v) => v.trim()).filter(Boolean))];
      if (name && values.length && !isSizeOpt(name) && !isColourOpt(name)) out.push({ name, values });
    }
    return out;
  }, [sizes, colours, canColour, advanced]);

  const setAdvancedOpt = (i: number, patch: Partial<OptionDef>) =>
    setAdvanced((o) => o.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const buildCombos = (opts: OptionDef[], prev: Draft[]): Draft[] => {
    const combos = cartesian(opts);
    const byKey = new Map(prev.map((r) => [Object.values(r.options).join("|"), r]));
    return combos.map((combo) => {
      const k = Object.values(combo).join("|");
      return (
        byKey.get(k) ?? {
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
  };

  const generate = () => {
    if (!cleanOptions.length) return toast("Add at least a size (or colour).", "error");
    const combos = cartesian(cleanOptions);
    if (combos.length > 200) return toast("That would create more than 200 variants.", "error");
    setRows((prev) => buildCombos(cleanOptions, prev));
  };

  const setRow = (i: number, patch: Partial<Draft>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = () =>
    start(async () => {
      // if the owner set sizes/colours but never generated the table, do it now
      const finalRows = rows.length || !cleanOptions.length ? rows : buildCombos(cleanOptions, []);
      const res = await saveVariants(
        productId,
        cleanOptions,
        finalRows.map((r) => ({
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
    <Modal open={open} onClose={onClose} title={`Sizes & colours — ${productName}`} size="lg">
      <div className="space-y-5">
        {/* SIZES — every plan */}
        <div>
          <p className="text-sm font-semibold text-fg">Sizes</p>
          <p className="mb-2 text-xs text-fg-subtle">Comma-separated, in the order to show. e.g. S, M, L, XL, XXL</p>
          <Input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL, XXL, XXXL" />
        </div>

        {/* COLOURS — paid only */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-fg">Colours</p>
            {!canColour && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-fg-muted">
                <Lock className="h-3 w-3" /> Business plan
              </span>
            )}
          </div>
          <p className="mb-2 text-xs text-fg-subtle">
            A colour name (Maroon, Sky) or a hex code (#7f1d1d). The circle shows the fill customers see.
          </p>

          <div className={canColour ? "space-y-2" : "pointer-events-none space-y-2 opacity-40"}>
            {colours.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="h-7 w-7 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: resolveSwatch(c) ?? "transparent" }}
                />
                <Input
                  className="flex-1"
                  value={c}
                  placeholder="Maroon  ·  #7f1d1d"
                  onChange={(e) => setColours((x) => x.map((v, j) => (j === i ? e.target.value : v)))}
                />
                <button onClick={() => setColours((x) => x.filter((_, j) => j !== i))} className="text-fg-subtle hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setColours((x) => [...x, ""])}>
              <Plus className="h-4 w-4" /> Colour
            </Button>
          </div>

          {!canColour && (
            <p className="mt-2 text-xs text-fg-muted">
              Colour variations are on the Business plan.{" "}
              <Link href="/app/billing" className="font-semibold text-accent hover:underline">
                Upgrade
              </Link>
            </p>
          )}
        </div>

        {/* ADVANCED — other option types + per-variant price/stock */}
        <div className="rounded-sm border border-border">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-fg-muted"
          >
            Advanced — other options &amp; per-variant price / stock
            <span>{showAdvanced ? "–" : "+"}</span>
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-border p-3">
              <div>
                <p className="mb-1 text-xs font-semibold text-fg-muted">Other options (e.g. Material)</p>
                <div className="space-y-2">
                  {advanced.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="w-32" placeholder="Option" value={o.name} onChange={(e) => setAdvancedOpt(i, { name: e.target.value })} />
                      <Input
                        className="flex-1"
                        placeholder="Cotton, Linen"
                        value={o.values.join(", ")}
                        onChange={(e) => setAdvancedOpt(i, { values: e.target.value.split(",").map((v) => v.trimStart()) })}
                      />
                      <button onClick={() => setAdvanced((x) => x.filter((_, j) => j !== i))} className="text-fg-subtle hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setAdvanced((o) => [...o, { name: "", values: [] }])}>
                  <Plus className="h-4 w-4" /> Option
                </Button>
              </div>

              <Button size="sm" variant="outline" onClick={generate}>
                <Wand2 className="h-4 w-4" /> Generate / refresh variant rows
              </Button>

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
                              onChange={(e) => setRow(i, { buying_price: e.target.value === "" ? null : Number(e.target.value) })}
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
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setRows([]);
              setSizes("");
              setColours([]);
              setAdvanced([]);
            }}
            className="text-xs text-danger hover:underline"
          >
            Clear all variants
          </button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
