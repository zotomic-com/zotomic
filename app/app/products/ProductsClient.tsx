"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { ImageUploader } from "@/components/app/ImageUploader";
import { money } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { createProduct, deleteProduct, updateProduct } from "./actions";

export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  status: string;
  price: number;
  buying_price: number | null;
  marketing_cost: number;
  stock_qty: number;
  image_urls: string[];
}

const STATUS_TONE = { active: "success", draft: "neutral", archived: "warning" } as const;

export function ProductsClient({ products, currency }: { products: ProductRow[]; currency: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      (p.category ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  const missingCosts = products.filter((p) => p.buying_price == null).length;

  const submit = (fn: () => Promise<{ error?: string; ok?: boolean }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast(res.error, "error");
      else {
        toast("Saved", "success");
        setEditing(null);
        setCreating(false);
        router.refresh();
      }
    });

  const cols: Column<ProductRow>[] = [
    { key: "name", header: "Product", render: (p) => <span className="font-medium text-fg">{p.name}</span> },
    { key: "category", header: "Category", render: (p) => p.category ?? "—" },
    { key: "price", header: "Price", align: "right", render: (p) => money(p.price, currency) },
    {
      key: "cost",
      header: "Buying price",
      align: "right",
      render: (p) =>
        p.buying_price == null ? (
          <span className="text-warning">Not set</span>
        ) : (
          money(p.buying_price, currency)
        ),
    },
    { key: "stock", header: "Stock", align: "right", render: (p) => p.stock_qty.toLocaleString("en-US") },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (p) => (
        <Badge tone={STATUS_TONE[p.status as keyof typeof STATUS_TONE] ?? "neutral"}>{p.status}</Badge>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add product
        </Button>
      </div>

      {missingCosts > 0 && (
        <p className="rounded-sm border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          {missingCosts} product{missingCosts > 1 ? "s" : ""} missing a buying price — profit can&apos;t
          be calculated until every sold product has one.
        </p>
      )}

      <div className="card">
        <DataTable
          columns={cols}
          rows={filtered}
          rowKey={(p) => p.id}
          onRowClick={(p) => setEditing(p)}
          empty={{ title: "No products yet", description: "Add your first product to get started." }}
        />
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Add product">
        <ProductForm currency={currency} pending={pending} onSubmit={(fd) => submit(() => createProduct(fd))} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.name ?? "Edit product"}>
        {editing && (
          <>
            <ProductForm
              currency={currency}
              product={editing}
              pending={pending}
              onSubmit={(fd) => submit(() => updateProduct(editing.id, fd))}
            />
            <button
              onClick={() =>
                start(async () => {
                  const res = await deleteProduct(editing.id);
                  if ("error" in res && res.error) toast(res.error, "error");
                  else {
                    toast(res.archived ? "Archived (product has orders)" : "Product deleted", "success");
                    setEditing(null);
                    router.refresh();
                  }
                })
              }
              className="mt-3 w-full rounded-sm border border-danger/30 py-2 text-sm font-semibold text-danger hover:bg-danger-soft"
            >
              Delete product
            </button>
          </>
        )}
      </Modal>
    </>
  );
}

function ProductForm({
  product,
  currency,
  pending,
  onSubmit,
}: {
  product?: ProductRow;
  currency: string;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  const [images, setImages] = useState<string[]>(product?.image_urls ?? []);
  return (
    <form
      action={(fd) => {
        fd.set("image_urls", JSON.stringify(images));
        onSubmit(fd);
      }}
      className="space-y-3"
    >
      <Field label="Images">
        <ImageUploader value={images} onChange={setImages} />
      </Field>
      <Field label="Name">
        <Input name="name" required defaultValue={product?.name} placeholder="Classic T-Shirt" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Input name="category" defaultValue={product?.category ?? ""} placeholder="T-Shirts" />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={product?.status ?? "draft"}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Selling price (${currency})`}>
          <Input name="price" type="number" step="0.01" min="0" defaultValue={product?.price ?? ""} />
        </Field>
        <Field label={`Buying price (${currency})`} hint="Needed for profit">
          <Input
            name="buying_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.buying_price ?? ""}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Marketing cost / unit (${currency})`}>
          <Input
            name="marketing_cost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.marketing_cost ?? 0}
          />
        </Field>
        <Field label="Stock">
          <Input name="stock_qty" type="number" min="0" defaultValue={product?.stock_qty ?? 0} />
        </Field>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : product ? "Save changes" : "Add product"}
      </Button>
    </form>
  );
}
