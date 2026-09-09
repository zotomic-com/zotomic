"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ImageUploader } from "@/components/app/ImageUploader";
import { ProductVariantsModal, type VariantRow } from "./ProductVariantsModal";
import { InventoryAdjust } from "./InventoryAdjust";
import { createProduct, updateProductFields } from "./actions";
import type { CategoryRow } from "./CategoryManager";

export interface EditorProduct {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: string | null;
  status: string;
  price: number;
  sale_price: number | null;
  buying_price: number | null;
  marketing_cost: number;
  stock_qty: number;
  track_inventory: boolean;
  image_urls: string[];
  options: { name: string; values: string[] }[];
  has_variants: boolean;
  is_hot: boolean;
  hide_badges: boolean;
  variants: VariantRow[];
}

const BLANK: EditorProduct = {
  id: "",
  name: "",
  description: null,
  sku: null,
  category: null,
  status: "draft",
  price: 0,
  sale_price: null,
  buying_price: null,
  marketing_cost: 0,
  stock_qty: 0,
  track_inventory: true,
  image_urls: [],
  options: [],
  has_variants: false,
  is_hot: false,
  hide_badges: false,
  variants: [],
};

export function ProductEditor({
  product,
  currency,
  categories,
  maxImages,
  plan,
}: {
  product?: EditorProduct;
  currency: string;
  categories: CategoryRow[];
  maxImages: number;
  plan: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const isNew = !product;
  const p = product ?? BLANK;

  const [f, setF] = useState({
    name: p.name,
    description: p.description ?? "",
    sku: p.sku ?? "",
    category: p.category ?? "",
    status: p.status,
    price: String(p.price ?? ""),
    sale_price: p.sale_price != null ? String(p.sale_price) : "",
    buying_price: p.buying_price != null ? String(p.buying_price) : "",
    marketing_cost: String(p.marketing_cost ?? 0),
    is_hot: p.is_hot,
    hide_badges: p.hide_badges,
  });
  const [images, setImages] = useState<string[]>(p.image_urls);
  const [stockQ, setStockQ] = useState(String(p.stock_qty ?? 0));
  const [trackInv, setTrackInv] = useState(p.track_inventory);
  const [variantsOpen, setVariantsOpen] = useState(false);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const margin = useMemo(() => {
    const sell = Number(f.sale_price) || Number(f.price) || 0;
    const cost = Number(f.buying_price) || 0;
    const mkt = Number(f.marketing_cost) || 0;
    if (!cost) return null;
    const m = sell - cost - mkt;
    return { amount: m, pct: sell > 0 ? Math.round((m / sell) * 100) : 0 };
  }, [f.price, f.sale_price, f.buying_price, f.marketing_cost]);

  const save = () =>
    start(async () => {
      if (f.name.trim().length < 2) return toast("Name is required.", "error");
      const patch = {
        name: f.name.trim(),
        description: f.description,
        sku: f.sku,
        category: f.category || null,
        status: f.status,
        price: f.price,
        sale_price: f.sale_price || null,
        buying_price: f.buying_price || null,
        marketing_cost: f.marketing_cost || 0,
        is_hot: f.is_hot,
        hide_badges: f.hide_badges,
        image_urls: images.slice(0, maxImages),
      };

      if (isNew) {
        const fd = new FormData();
        Object.entries(patch).forEach(([k, v]) =>
          fd.set(k, k === "image_urls" ? JSON.stringify(v) : String(v ?? "")),
        );
        fd.set("stock_qty", stockQ || "0");
        fd.set("track_inventory", trackInv ? "on" : "");
        if (patch.is_hot) fd.set("is_hot", "on");
        if (patch.hide_badges) fd.set("hide_badges", "on");
        const res = await createProduct(fd);
        if ("error" in res && res.error) return toast(res.error, "error");
        toast("Product created", "success");
        router.push("id" in res && res.id ? `/app/products/${res.id}` : "/app/products");
        return;
      }

      const res = await updateProductFields(p.id, patch);
      if ("error" in res) return toast(res.error, "error");
      toast("Saved", "success");
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
        </CardHeader>
        <CardBody>
          <ImageUploader value={images} onChange={setImages} max={maxImages} />
          <p className="mt-2 text-xs text-fg-subtle">First image is the main one. Up to {maxImages}.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Name">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Classic T-Shirt" />
          </Field>
          <Field label="Description" hint="Shown on the product page">
            <Textarea rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Category">
              {categories.length ? (
                <Select value={f.category} onChange={(e) => set("category", e.target.value)}>
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {f.category && !categories.some((c) => c.name === f.category) && <option value={f.category}>{f.category}</option>}
                </Select>
              ) : (
                <Input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Shirts" />
              )}
            </Field>
            <Field label="SKU">
              <Input value={f.sku} onChange={(e) => set("sku", e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Status">
              <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Selling price (${currency})`}>
              <Input type="number" step="0.01" min="0" value={f.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label={`Sale price (${currency})`} hint="Leave blank for none">
              <Input type="number" step="0.01" min="0" value={f.sale_price} onChange={(e) => set("sale_price", e.target.value)} />
            </Field>
            <Field label={`Buying price (${currency})`} hint="Needed for profit">
              <Input type="number" step="0.01" min="0" value={f.buying_price} onChange={(e) => set("buying_price", e.target.value)} />
            </Field>
            <Field label={`Marketing cost / unit (${currency})`}>
              <Input type="number" step="0.01" min="0" value={f.marketing_cost} onChange={(e) => set("marketing_cost", e.target.value)} />
            </Field>
          </div>
          {margin && (
            <p className={`text-sm ${margin.amount < 0 ? "text-danger" : "text-fg-muted"}`}>
              Margin per unit: <span className="font-semibold">{money(margin.amount, currency)}</span> ({margin.pct}%)
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {p.has_variants ? (
            <p className="text-sm text-fg-muted">
              Stock is managed per variant ({p.variants.filter((v) => v.active).length} active) — total {p.stock_qty}.
            </p>
          ) : isNew ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starting stock">
                  <Input type="number" min="0" value={stockQ} onChange={(e) => setStockQ(e.target.value)} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={trackInv} onChange={(e) => setTrackInv(e.target.checked)} />
                Track stock — show &ldquo;only N left&rdquo; / &ldquo;sold out&rdquo; on the storefront
              </label>
            </>
          ) : (
            <InventoryAdjust
              productId={p.id}
              currentStock={p.stock_qty}
              tracked={p.track_inventory}
              canStopTracking
              onDone={() => router.refresh()}
            />
          )}

          {!isNew && (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <div>
                <p className="text-sm font-semibold text-fg">Variants</p>
                <p className="text-xs text-fg-subtle">
                  {p.has_variants ? `${p.variants.filter((v) => v.active).length} active` : "Sizes, colours — optional"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setVariantsOpen(true)}>
                {p.has_variants ? "Edit variants" : "Add variants"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storefront badges</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.is_hot} onChange={(e) => set("is_hot", e.target.checked)} />
            Mark as <span className="font-semibold text-danger">Hot</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.hide_badges} onChange={(e) => set("hide_badges", e.target.checked)} />
            Hide all badges on this product
          </label>
        </CardBody>
      </Card>

      <div className="sticky bottom-4 z-30 flex justify-end">
        <Button onClick={save} disabled={pending} className="shadow-lg">
          {pending ? "Saving…" : isNew ? "Create product" : "Save changes"}
        </Button>
      </div>

      {!isNew && variantsOpen && (
        <ProductVariantsModal
          open={variantsOpen}
          onClose={() => {
            setVariantsOpen(false);
            router.refresh();
          }}
          productId={p.id}
          productName={f.name || p.name}
          currency={currency}
          plan={plan}
          initialOptions={p.options ?? []}
          initialVariants={p.variants ?? []}
        />
      )}
    </div>
  );
}
