"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v === null || v === "" || Number.isNaN(n) ? null : n;
};

function parseImages(v: FormDataEntryValue | null): string[] {
  try {
    const arr = JSON.parse(String(v ?? "[]"));
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

export async function createProduct(formData: FormData) {
  const { businessId, user, db } = await requireBusiness();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Name is required" };

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
      price: num(formData.get("price")) ?? 0,
      buying_price: num(formData.get("buying_price")),
      marketing_cost: num(formData.get("marketing_cost")) ?? 0,
      stock_qty: num(formData.get("stock_qty")) ?? 0,
      image_urls: parseImages(formData.get("image_urls")),
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
  return { ok: true };
}

export async function updateProduct(id: string, formData: FormData) {
  const { businessId, user, db } = await requireBusiness();

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
    image_urls: parseImages(formData.get("image_urls")),
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
): Promise<{ error: string } | { ok: true; count: number }> {
  const { businessId, user, db } = await requireBusiness();
  if (!Array.isArray(rows) || rows.length === 0) return { error: "Nothing to import" };
  if (rows.length > 1000) return { error: "Import is limited to 1000 rows at a time." };

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
    summary: `Imported ${records.length} products from CSV`,
  });
  revalidatePath("/app/products");
  return { ok: true, count: records.length };
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
