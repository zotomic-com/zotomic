"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { parseCsv, autoMap } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { importOrders, type OrderImportRow } from "./import-actions";

const FIELDS = [
  { key: "order_number", label: "Order number", aliases: ["orderid", "invoice", "orderno", "reference"] },
  { key: "customer_name", label: "Customer name", aliases: ["name", "buyer", "customer"] },
  { key: "customer_phone", label: "Customer phone", aliases: ["phone", "mobile", "contact"] },
  { key: "product", label: "Product (name or SKU) *", aliases: ["item", "productname", "sku"] },
  { key: "qty", label: "Quantity", aliases: ["quantity", "count"] },
  { key: "status", label: "Status", aliases: ["orderstatus", "state"] },
  { key: "payment_method", label: "Payment method", aliases: ["payment", "paymentmode"] },
  { key: "shipping", label: "Shipping", aliases: ["deliverycharge", "shippingfee"] },
  { key: "date", label: "Date", aliases: ["orderdate", "placedat", "createdat"] },
];

export function OrderImport() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});

  const onFile = async (file: File) => {
    const parsed = parseCsv(await file.text());
    if (!parsed.headers.length) return toast("Couldn't read that CSV.", "error");
    setHeaders(parsed.headers);
    setRows(parsed.rows.slice(0, 2000));
    setMap(autoMap(parsed.headers, FIELDS));
    setOpen(true);
  };

  const doImport = () => {
    if (!map.product) return toast("Map the Product column.", "error");
    const payload: OrderImportRow[] = rows.map((r) => {
      const o: Record<string, string> = {};
      for (const f of FIELDS) if (map[f.key]) o[f.key] = r[map[f.key]] ?? "";
      return o as OrderImportRow;
    });
    start(async () => {
      const res = await importOrders(payload);
      if ("error" in res) toast(res.error, "error");
      else {
        toast(`Imported ${res.created} orders${res.skipped ? ` · ${res.skipped} skipped` : ""}`, "success");
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2">
        <Upload className="h-3.5 w-3.5" /> Import CSV
        <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>

      <Modal open={open} onClose={() => setOpen(false)} title={`Import ${rows.length} rows`}>
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            One row per product line. Rows sharing an order number become one order. Products are
            matched by name or SKU — unmatched rows are skipped.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-xs font-medium text-fg">
                {f.label}
                <Select value={map[f.key] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))} className="mt-1 h-9">
                  <option value="">— skip —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          <Button onClick={doImport} disabled={pending || !map.product} className="w-full">
            {pending ? "Importing…" : "Import orders"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
