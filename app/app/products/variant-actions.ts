"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";

export interface OptionDef {
  name: string;
  values: string[];
}
export interface VariantInput {
  id?: string;
  name: string;
  options: Record<string, string>;
  sku?: string;
  price?: number | null;
  sale_price?: number | null;
  buying_price?: number | null;
  stock_qty?: number;
  active?: boolean;
}

const clampInt = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
const numOrNull = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Replace the full option + variant set for a product in one call. */
export async function saveVariants(
  productId: string,
  options: OptionDef[],
  variants: VariantInput[],
): Promise<{ error: string } | { ok: true; count: number }> {
  const { businessId, user, db } = await requireBusiness();

  const { data: product } = await db
    .from("products")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { error: "Product not found" };

  const cleanOptions = options
    .map((o) => ({
      name: String(o.name ?? "").trim().slice(0, 40),
      values: [...new Set((o.values ?? []).map((v) => String(v).trim()).filter(Boolean))].slice(0, 30),
    }))
    .filter((o) => o.name && o.values.length);

  if (variants.length > 200) return { error: "A product can have at most 200 variants." };

  const { data: existing } = await db
    .from("product_variants")
    .select("id")
    .eq("business_id", businessId)
    .eq("product_id", productId);
  const existingIds = new Set((existing ?? []).map((v) => v.id as string));
  const keepIds = new Set(variants.filter((v) => v.id).map((v) => v.id as string));

  // delete removed variants (only if not referenced by an order)
  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
  for (const id of toDelete) {
    const { count } = await db
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("variant_id", id);
    if ((count ?? 0) > 0) {
      await db.from("product_variants").update({ active: false }).eq("id", id).eq("business_id", businessId);
    } else {
      await db.from("product_variants").delete().eq("id", id).eq("business_id", businessId);
    }
  }

  // upsert kept / new
  let pos = 0;
  for (const v of variants) {
    const row = {
      business_id: businessId,
      product_id: productId,
      name: String(v.name ?? Object.values(v.options ?? {}).join(" / ")).trim().slice(0, 120) || "Variant",
      sku: v.sku ? String(v.sku).trim().slice(0, 60) : null,
      options: v.options ?? {},
      price: numOrNull(v.price),
      sale_price: numOrNull(v.sale_price),
      buying_price: numOrNull(v.buying_price),
      stock_qty: clampInt(v.stock_qty),
      active: v.active !== false,
      position: pos++,
    };
    if (v.id && existingIds.has(v.id)) {
      await db.from("product_variants").update(row).eq("id", v.id).eq("business_id", businessId);
    } else {
      await db.from("product_variants").insert(row);
    }
  }

  const hasVariants = variants.length > 0;
  // keep product.stock_qty as the sum of active variant stock
  const totalStock = variants.filter((v) => v.active !== false).reduce((s, v) => s + clampInt(v.stock_qty), 0);
  await db
    .from("products")
    .update({
      options: cleanOptions,
      has_variants: hasVariants,
      ...(hasVariants ? { stock_qty: totalStock, track_inventory: true } : {}),
    })
    .eq("business_id", businessId)
    .eq("id", productId);

  await writeAudit(businessId, user.id, "product.variants_updated", {
    targetType: "product",
    targetId: productId,
    summary: `${variants.length} variant(s) on "${product.name}"`,
  });

  revalidatePath("/app/products");
  revalidatePath("/app/inventory");
  return { ok: true, count: variants.length };
}

/** Log a stock change with a reason and apply it to product or variant. */
export async function adjustInventory(input: {
  productId: string;
  variantId?: string | null;
  delta: number;
  reason: string;
  note?: string;
}): Promise<{ error: string } | { ok: true; balance: number }> {
  const { businessId, user, db } = await requireBusiness();
  const delta = Math.round(Number(input.delta) || 0);
  if (!delta) return { error: "Enter a non-zero quantity." };
  const reason = ["recount", "restock", "damage", "theft", "correction", "sale", "return", "other"].includes(
    input.reason,
  )
    ? input.reason
    : "correction";

  let balance: number;
  if (input.variantId) {
    const { data: v } = await db
      .from("product_variants")
      .select("stock_qty")
      .eq("business_id", businessId)
      .eq("id", input.variantId)
      .maybeSingle();
    if (!v) return { error: "Variant not found" };
    balance =
      reason === "recount" ? Math.max(0, delta) : Math.max(0, Number(v.stock_qty) + delta);
    await db.from("product_variants").update({ stock_qty: balance }).eq("id", input.variantId);
    // refresh product total
    const { data: sib } = await db
      .from("product_variants")
      .select("stock_qty")
      .eq("business_id", businessId)
      .eq("product_id", input.productId)
      .eq("active", true);
    await db
      .from("products")
      .update({ stock_qty: (sib ?? []).reduce((s, r) => s + Number(r.stock_qty), 0) })
      .eq("id", input.productId);
  } else {
    const { data: p } = await db
      .from("products")
      .select("stock_qty")
      .eq("business_id", businessId)
      .eq("id", input.productId)
      .maybeSingle();
    if (!p) return { error: "Product not found" };
    balance =
      reason === "recount" ? Math.max(0, delta) : Math.max(0, Number(p.stock_qty) + delta);
    await db
      .from("products")
      .update({ stock_qty: balance, track_inventory: true })
      .eq("business_id", businessId)
      .eq("id", input.productId);
  }

  await db.from("inventory_adjustments").insert({
    business_id: businessId,
    product_id: input.productId,
    variant_id: input.variantId ?? null,
    delta: reason === "recount" ? balance : delta,
    balance,
    reason,
    note: input.note ? String(input.note).slice(0, 300) : null,
    created_by: user.id,
  });

  await writeAudit(businessId, user.id, "inventory.adjusted", {
    targetType: "product",
    targetId: input.productId,
    summary: `${delta > 0 ? "+" : ""}${delta} (${reason}) → ${balance}`,
  });

  revalidatePath("/app/products");
  revalidatePath("/app/inventory");
  return { ok: true, balance };
}
