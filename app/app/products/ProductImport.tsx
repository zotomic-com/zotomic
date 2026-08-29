"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { parseCsv, autoMap } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { importProducts, type ImportRow } from "./actions";

const FIELDS = [
  { key: "name", label: "Name *", aliases: ["title", "product", "productname"] },
  { key: "price", label: "Selling price", aliases: ["sellingprice", "mrp", "rate", "amount"] },
  { key: "buying_price", label: "Buying price", aliases: ["costprice", "cost", "purchaseprice"] },
  { key: "marketing_cost", label: "Marketing cost", aliases: ["adcost", "marketing"] },
  { key: "category", label: "Category", aliases: ["cat", "type", "collection"] },
  { key: "stock_qty", label: "Stock", aliases: ["stock", "qty", "quantity", "inventory"] },
  { key: "status", label: "Status", aliases: ["state", "visibility"] },
  { key: "sku", label: "SKU", aliases: ["code", "barcode"] },
];

export function ProductImport() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.headers.length) {
      toast("Couldn't read that CSV.", "error");
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows.slice(0, 1000));
    setMap(autoMap(parsed.headers, FIELDS));
    setOpen(true);
  };

  const doImport = () => {
    if (!map.name) {
      toast("Map the Name column.", "error");
      return;
    }
    const payload: ImportRow[] = rows.map((r) => {
      const o: Record<string, string> = {};
      for (const f of FIELDS) if (map[f.key]) o[f.key] = r[map[f.key]] ?? "";
      return o as unknown as ImportRow;
    });
    start(async () => {
      const res = await importProducts(payload);
      if ("error" in res) toast(res.error, "error");
      else {
        toast(`Imported ${res.count} products`, "success");
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-2">
        <Upload className="h-4 w-4" /> Import CSV
        <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>

      <Modal open={open} onClose={() => setOpen(false)} title={`Import ${rows.length} products`}>
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">Match your CSV columns to Zotomic fields. New products are created as drafts unless a Status column says otherwise.</p>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-xs font-medium text-fg">
                {f.label}
                <Select
                  value={map[f.key] ?? ""}
                  onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))}
                  className="mt-1 h-9"
                >
                  <option value="">— skip —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </Select>
              </label>
            ))}
          </div>

          {map.name && (
            <div className="max-h-40 overflow-auto rounded-sm border border-border text-xs">
              <table className="w-full">
                <tbody>
                  {rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-2 py-1 font-medium">{r[map.name]}</td>
                      <td className="px-2 py-1 text-fg-muted">{map.price ? r[map.price] : ""}</td>
                      <td className="px-2 py-1 text-fg-muted">{map.category ? r[map.category] : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Button onClick={doImport} disabled={pending || !map.name} className="w-full">
            {pending ? "Importing…" : `Import ${rows.length} products`}
          </Button>
        </div>
      </Modal>
    </>
  );
}
