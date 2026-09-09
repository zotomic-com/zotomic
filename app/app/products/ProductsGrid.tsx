"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { DataGrid, type GridColumn } from "@/components/app/DataGrid";
import { ListToolbar } from "@/components/app/ListToolbar";
import { BulkBar } from "@/components/app/BulkBar";
import { ProductImport } from "./ProductImport";
import { CategoryManager, type CategoryRow } from "./CategoryManager";
import { bulkRemoveProducts, bulkUpdateProducts } from "./actions";
import type { VariantRow } from "./ProductVariantsModal";

export interface ProductRow {
  id: string;
  name: string;
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
  sold: number;
}

export interface ProductLimits {
  products: number;
  productImages: number;
  plan: string;
  grandfathered: boolean;
  activeCount: number;
}

const STATUS_TONE = { active: "success", draft: "neutral", archived: "warning" } as const;

export function ProductsGrid({
  products,
  currency,
  categories,
  limits,
}: {
  products: ProductRow[];
  currency: string;
  categories: CategoryRow[];
  limits: ProductLimits;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [cat, setCat] = useState("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [managingCats, setManagingCats] = useState(false);

  const atCap = limits.activeCount >= limits.products;
  const planName = limits.plan === "free" ? "Free" : limits.plan === "business" ? "Business" : "Pro";
  const missingCosts = products.filter((p) => p.buying_price == null && p.sold > 0).length;

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (status === "all" || p.status === status) &&
        (cat === "all" || (cat === "none" ? !p.category : p.category === cat)) &&
        (!t || p.name.toLowerCase().includes(t) || (p.sku ?? "").toLowerCase().includes(t) || (p.category ?? "").toLowerCase().includes(t)),
    );
  }, [products, q, status, cat]);

  const count = (s: string) => products.filter((p) => p.status === s).length;

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) return toast(res.error, "error");
      toast(msg, "success");
      setSel(new Set());
      router.refresh();
    });

  const ids = [...sel];

  const cols: GridColumn<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-sm border border-border bg-surface-2">
            {p.image_urls[0] && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cldUrl(p.image_urls[0], 72)} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{p.name}</p>
            {p.sku && <p className="text-xs text-fg-subtle">{p.sku}</p>}
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (p) => p.category ?? "—" },
    {
      key: "price",
      header: "Price",
      align: "right",
      render: (p) =>
        p.sale_price != null && p.sale_price < p.price ? (
          <span>
            <span className="font-medium text-fg">{money(p.sale_price, currency)}</span>{" "}
            <span className="text-xs text-fg-subtle line-through">{money(p.price, currency)}</span>
          </span>
        ) : (
          money(p.price, currency)
        ),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      render: (p) => {
        if (p.buying_price == null) return <span className="text-warning">—</span>;
        const sell = p.sale_price ?? p.price;
        const m = sell - p.buying_price - p.marketing_cost;
        const pct = sell > 0 ? Math.round((m / sell) * 100) : 0;
        return <span className={m < 0 ? "text-danger" : "text-fg"}>{pct}%</span>;
      },
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      render: (p) =>
        p.has_variants ? (
          <span className="text-fg-muted">
            {p.stock_qty.toLocaleString("en-US")} · {p.variants.filter((v) => v.active).length}v
          </span>
        ) : !p.track_inventory ? (
          <span className="text-fg-subtle">not tracked</span>
        ) : p.stock_qty <= 0 ? (
          <span className="text-danger">out</span>
        ) : p.stock_qty <= 5 ? (
          <span className="text-warning">{p.stock_qty}</span>
        ) : (
          p.stock_qty.toLocaleString("en-US")
        ),
    },
    { key: "sold", header: "Sold", align: "right", render: (p) => p.sold.toLocaleString("en-US") },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (p) => <Badge tone={STATUS_TONE[p.status as keyof typeof STATUS_TONE] ?? "neutral"}>{p.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      <ListToolbar
        search={q}
        onSearch={setQ}
        searchPlaceholder="Search name, SKU, category…"
        actions={
          <>
            <ProductImport />
            <Button variant="outline" onClick={() => setManagingCats(true)}>
              Categories
            </Button>
            <Button href={atCap ? undefined : "/app/products/new"} disabled={atCap}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          </>
        }
        filters={[
          {
            key: "status",
            value: status,
            onChange: setStatus,
            options: [
              { value: "all", label: "All", count: products.length },
              { value: "active", label: "Active", count: count("active") },
              { value: "draft", label: "Draft", count: count("draft") },
              { value: "archived", label: "Archived", count: count("archived") },
            ],
          },
          ...(categories.length
            ? [
                {
                  key: "cat",
                  label: "Category",
                  value: cat,
                  onChange: setCat,
                  options: [
                    { value: "all", label: "All" },
                    ...categories.map((c) => ({ value: c.name, label: c.name, count: c.productCount })),
                    { value: "none", label: "Uncategorised" },
                  ],
                },
              ]
            : []),
        ]}
      />

      <p className="text-xs text-fg-subtle">
        {limits.activeCount} / {limits.products} products on the {planName} plan.
      </p>

      {atCap && (
        <p className="rounded-sm border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          You&apos;ve reached the {planName} plan limit. Upgrade or archive a product to add more.
        </p>
      )}
      {missingCosts > 0 && (
        <p className="rounded-sm border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          {missingCosts} sold product{missingCosts > 1 ? "s are" : " is"} missing a buying price — profit is
          incomplete until every one has one.
        </p>
      )}

      <div className="card">
        <DataGrid
          columns={cols}
          rows={rows}
          rowKey={(p) => p.id}
          rowHref={(p) => `/app/products/${p.id}`}
          selected={sel}
          onSelectedChange={setSel}
          empty={{ title: "No products match", description: "Adjust the filters or add a product." }}
        />
      </div>

      <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => bulkUpdateProducts(ids, { status: "active" }), "Set to active")}>
          Activate
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => bulkUpdateProducts(ids, { status: "draft" }), "Set to draft")}>
          Draft
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => bulkUpdateProducts(ids, { status: "archived" }), "Archived")}>
          Archive
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          className="text-danger"
          onClick={() => {
            if (window.confirm(`Delete ${sel.size} product(s)? Products with orders are archived instead.`))
              run(async () => {
                const r = await bulkRemoveProducts(ids);
                return "ok" in r ? { ok: true } : r;
              }, "Removed");
          }}
        >
          Delete
        </Button>
      </BulkBar>

      <CategoryManager open={managingCats} onClose={() => setManagingCats(false)} categories={categories} />
    </div>
  );
}
