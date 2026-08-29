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
    .select("id, name, price, buying_price, marketing_cost, stock_qty, status, category")
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
