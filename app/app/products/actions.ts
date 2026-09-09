"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { checkProductLimit, getPlanLimits, remainingProductBudget } from "@/lib/plan-limits";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v === null || v === "" || Number.isNaN(n) ? null : n;
};

function parseImages(v: FormDataEntryValue | null, limit = 10): string[] {
  try {
    const arr = JSON.parse(String(v ?? "[]"));
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, Math.max(0, limit)) : [];
  } catch {
    return [];
  }
}

export async function createProduct(formData: FormData) {
  const { businessId, user, db } = await requireBusiness();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Name is required" };

  const limitHit = await checkProductLimit(businessId, 1);
  if (limitHit) return { error: limitHit.error };
  const { productImages } = await getPlanLimits(businessId);

  let slug = slugify(name) || "product";
  const { data: dupe } = await db
    .from("products")
    .select("id")
    .eq("business_id", businessId)
    .eq("slug", slug)
    .maybeSingle();
  if (dupe) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const { data, error } = await db
    .from("products")
    .insert({
      business_id: businessId,
      name,
      slug,
      status: String(formData.get("status") ?? "draft"),
      category: String(formData.get("category") ?? "") || null,
      description: String(formData.get("description") ?? "").trim().slice(0, 5000) || null,
      sku: String(formData.get("sku") ?? "").trim().slice(0, 60) || null,
      price: num(formData.get("price")) ?? 0,
      sale_price: num(formData.get("sale_price")),
      buying_price: num(formData.get("buying_price")),
      marketing_cost: num(formData.get("marketing_cost")) ?? 0,
      stock_qty: num(formData.get("stock_qty")) ?? 0,
      track_inventory: formData.get("track_inventory") === "on",
      image_urls: parseImages(formData.get("image_urls"), productImages),
      is_hot: formData.get("is_hot") === "on",
      hide_badges: formData.get("hide_badges") === "on",
    })
    .select("id")
    .single();

  if (error) return { error: "Could not create product" };
  await writeAudit(businessId, user.id, "product.created", {
    targetType: "product",
    targetId: data.id,
    summary: `Created product "${name}"`,
  });
  revalidatePath("/app/products");
  return { ok: true, id: data.id as string };
}

export async function updateProduct(id: string, formData: FormData) {
  const { businessId, user, db } = await requireBusiness();
  const { productImages } = await getPlanLimits(businessId);

  const { data: before } = await db
    .from("products")
    .select("id, name, price, buying_price, marketing_cost, stock_qty, status, category, image_urls")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "Product not found" };

  const patch = {
    name: String(formData.get("name") ?? before.name).trim(),
    status: String(formData.get("status") ?? before.status),
    category: String(formData.get("category") ?? "") || null,
    price: num(formData.get("price")) ?? before.price,
    buying_price: num(formData.get("buying_price")),
    marketing_cost: num(formData.get("marketing_cost")) ?? 0,
    stock_qty: num(formData.get("stock_qty")) ?? before.stock_qty,
    track_inventory: formData.get("track_inventory") === "on",
    image_urls: parseImages(formData.get("image_urls"), productImages),
    is_hot: formData.get("is_hot") === "on",
    hide_badges: formData.get("hide_badges") === "on",
  };

  const { error } = await db.from("products").update(patch).eq("business_id", businessId).eq("id", id);
  if (error) return { error: "Could not save" };

  await writeAudit(businessId, user.id, "product.updated", {
    targetType: "product",
    targetId: id,
    summary: `Updated "${patch.name}"`,
    before,
    after: patch,
  });
  revalidatePath("/app/products");
  return { ok: true };
}

export interface ImportRow {
  name: string;
  price?: string;
  buying_price?: string;
  marketing_cost?: string;
  category?: string;
  stock_qty?: string;
  status?: string;
  sku?: string;
}

export async function importProducts(
  rows: ImportRow[],
): Promise<{ error: string } | { ok: true; count: number; skipped?: number }> {
  const { businessId, user, db } = await requireBusiness();
  if (!Array.isArray(rows) || rows.length === 0) return { error: "Nothing to import" };
  if (rows.length > 1000) return { error: "Import is limited to 1000 rows at a time." };

  const budget = await remainingProductBudget(businessId);
  if (budget <= 0) {
    return { error: "You're at your plan's product limit. Upgrade or archive products before importing." };
  }
  let skipped = 0;
  if (rows.length > budget) {
    skipped = rows.length - budget;
    rows = rows.slice(0, budget);
  }

  const num = (v?: string) => {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? null : n;
  };

  const { data: existing } = await db.from("products").select("slug").eq("business_id", businessId);
  const taken = new Set((existing ?? []).map((p) => p.slug as string));

  const records = rows
    .map((r) => {
      const name = String(r.name ?? "").trim().slice(0, 200);
      if (name.length < 2) return null;
      let slug = slugify(name) || "product";
      while (taken.has(slug)) slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
      taken.add(slug);
      const status = ["active", "draft", "archived"].includes(String(r.status ?? "").toLowerCase())
        ? String(r.status).toLowerCase()
        : "draft";
      return {
        business_id: businessId,
        name,
        slug,
        status,
        category: String(r.category ?? "").trim().slice(0, 80) || null,
        sku: String(r.sku ?? "").trim().slice(0, 60) || null,
        price: num(r.price) ?? 0,
        buying_price: num(r.buying_price),
        marketing_cost: num(r.marketing_cost) ?? 0,
        stock_qty: Math.max(0, Math.round(num(r.stock_qty) ?? 0)),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (records.length === 0) return { error: "No valid rows (every row needs a name)." };

  const { error } = await db.from("products").insert(records);
  if (error) return { error: "Import failed — check the data and try again." };

  await writeAudit(businessId, user.id, "products.imported", {
    targetType: "product",
    summary: `Imported ${records.length} products from CSV${skipped ? ` (${skipped} skipped — plan limit)` : ""}`,
  });
  revalidatePath("/app/products");
  return { ok: true, count: records.length, skipped: skipped || undefined };
}

export async function deleteProduct(
  id: string,
): Promise<{ error: string } | { ok: true; archived?: true }> {
  const { businessId, user, db } = await requireBusiness();

  const { data: p } = await db
    .from("products")
    .select("name")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (!p) return { error: "Product not found" };

  // guard: don't orphan order history — archive instead if it has sold
  const { count } = await db
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("product_id", id);

  if ((count ?? 0) > 0) {
    await db.from("products").update({ status: "archived", visible: false }).eq("business_id", businessId).eq("id", id);
    await writeAudit(businessId, user.id, "product.archived", { targetType: "product", targetId: id, summary: `Archived "${p.name}" (has orders)` });
    revalidatePath("/app/products");
    return { ok: true, archived: true };
  }

  await db.from("products").delete().eq("business_id", businessId).eq("id", id);
  await writeAudit(businessId, user.id, "product.deleted", { targetType: "product", targetId: id, summary: `Deleted "${p.name}"` });
  revalidatePath("/app/products");
  return { ok: true };
}

/* ─── Detail-page inline editor + bulk actions ─────────────────────────────── */

const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "category",
  "sku",
  "status",
  "price",
  "sale_price",
  "buying_price",
  "marketing_cost",
  "is_hot",
  "hide_badges",
  "image_urls",
]);
const NUM_FIELDS = new Set(["price", "sale_price", "buying_price", "marketing_cost"]);

/** Partial update from the product detail page — one section at a time. */
export async function updateProductFields(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ error: string } | { ok: true }> {
  const { businessId, user, db } = await requireBusiness();
  const { productImages } = await getPlanLimits(businessId);

  const { data: before } = await db
    .from("products")
    .select("id, name, status")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "Product not found" };

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k === "image_urls") {
      clean[k] = Array.isArray(v) ? (v as unknown[]).filter((s) => typeof s === "string").slice(0, productImages) : [];
    } else if (NUM_FIELDS.has(k)) {
      const n = v === "" || v == null ? null : Number(v);
      clean[k] = Number.isFinite(n as number) ? n : null;
    } else if (k === "is_hot" || k === "hide_badges") {
      clean[k] = !!v;
    } else if (k === "status") {
      clean[k] = ["active", "draft", "archived"].includes(String(v)) ? v : before.status;
    } else {
      clean[k] = String(v ?? "").trim().slice(0, k === "description" ? 5000 : 200) || null;
    }
  }
  if (clean.name === null) delete clean.name; // name can't be blanked

  if (!Object.keys(clean).length) return { ok: true };

  const { error } = await db.from("products").update(clean).eq("business_id", businessId).eq("id", id);
  if (error) return { error: "Could not save changes." };

  await writeAudit(businessId, user.id, "product.updated", {
    targetType: "product",
    targetId: id,
    summary: `Edited ${Object.keys(clean).join(", ")}`,
  });
  revalidatePath("/app/products");
  revalidatePath(`/app/products/${id}`);
  return { ok: true };
}

export async function bulkUpdateProducts(
  ids: string[],
  patch: { status?: string; category?: string | null },
): Promise<{ error: string } | { ok: true; count: number }> {
  const { businessId, user, db } = await requireBusiness();
  const list = (ids ?? []).filter(Boolean).slice(0, 500);
  if (!list.length) return { error: "Nothing selected." };

  const clean: Record<string, unknown> = {};
  if (patch.status && ["active", "draft", "archived"].includes(patch.status)) {
    clean.status = patch.status;
    if (patch.status === "archived") clean.visible = false;
    if (patch.status === "active") clean.visible = true;
  }
  if (patch.category !== undefined) clean.category = patch.category ? String(patch.category).slice(0, 80) : null;
  if (!Object.keys(clean).length) return { error: "No change to apply." };

  const { error } = await db.from("products").update(clean).eq("business_id", businessId).in("id", list);
  if (error) return { error: "Bulk update failed." };

  await writeAudit(businessId, user.id, "products.bulk_updated", {
    targetType: "product",
    summary: `${list.length} products — ${Object.entries(clean).map(([k, v]) => `${k}=${v}`).join(", ")}`,
  });
  revalidatePath("/app/products");
  return { ok: true, count: list.length };
}

/** Delete selected products; any with order history is archived instead. */
export async function bulkRemoveProducts(
  ids: string[],
): Promise<{ error: string } | { ok: true; deleted: number; archived: number }> {
  const { businessId, user, db } = await requireBusiness();
  const list = [...new Set((ids ?? []).filter(Boolean))].slice(0, 200);
  if (!list.length) return { error: "Nothing selected." };

  const { data: sold } = await db
    .from("order_items")
    .select("product_id")
    .eq("business_id", businessId)
    .in("product_id", list);
  const hasOrders = new Set((sold ?? []).map((r) => r.product_id as string));

  const toArchive = list.filter((id) => hasOrders.has(id));
  const toDelete = list.filter((id) => !hasOrders.has(id));

  if (toArchive.length) {
    await db
      .from("products")
      .update({ status: "archived", visible: false })
      .eq("business_id", businessId)
      .in("id", toArchive);
  }
  if (toDelete.length) {
    await db.from("products").delete().eq("business_id", businessId).in("id", toDelete);
  }

  await writeAudit(businessId, user.id, "products.bulk_removed", {
    targetType: "product",
    summary: `${toDelete.length} deleted, ${toArchive.length} archived (had orders)`,
  });
  revalidatePath("/app/products");
  return { ok: true, deleted: toDelete.length, archived: toArchive.length };
}
