"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { isColourOpt } from "@/lib/storefront/colour";

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
  const { businessId, user, db, billing } = await requireBusiness();

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

  // Colour variations are a paid feature — free stores get size (and other) options only.
  if (billing.plan === "free" && cleanOptions.some((o) => isColourOpt(o.name))) {
    return { error: "Colour variations are on the Business plan. Upgrade to add colours." };
  }

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

const ADJ_REASONS = ["recount", "restock", "damage", "theft", "correction", "sale", "return", "other"];

/**
 * Change stock for a product (or a variant).
 *  - mode "set":    `amount` is the new exact total (0 allowed → out of stock)
 *  - mode "adjust":  `amount` is a +/- delta (must be non-zero)
 */
export async function adjustInventory(input: {
  productId: string;
  variantId?: string | null;
  mode: "set" | "adjust";
  amount: number;
  reason: string;
  note?: string;
}): Promise<{ error: string } | { ok: true; balance: number }> {
  const { businessId, user, db } = await requireBusiness();
  const mode = input.mode === "set" ? "set" : "adjust";
  const amount = Math.round(Number(input.amount) || 0);
  if (mode === "adjust" && amount === 0) return { error: "Enter a non-zero quantity to add or remove." };
  if (mode === "set" && amount < 0) return { error: "Stock can't be negative." };
  const reason = ADJ_REASONS.includes(input.reason) ? input.reason : mode === "set" ? "recount" : "correction";

  const table = input.variantId ? "product_variants" : "products";
  const idCol = input.variantId ?? input.productId;
  const { data: current } = await db
    .from(table)
    .select("stock_qty")
    .eq("business_id", businessId)
    .eq("id", idCol)
    .maybeSingle();
  if (!current) return { error: input.variantId ? "Variant not found" : "Product not found" };

  const before = Number(current.stock_qty);
  const balance = mode === "set" ? Math.max(0, amount) : Math.max(0, before + amount);
  const delta = balance - before;

  if (input.variantId) {
    await db.from("product_variants").update({ stock_qty: balance }).eq("id", input.variantId).eq("business_id", businessId);
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
    delta,
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

/** Turn stock tracking on/off for a simple (non-variant) product. */
export async function setStockTracking(
  productId: string,
  tracked: boolean,
): Promise<{ error: string } | { ok: true }> {
  const { businessId, user, db } = await requireBusiness();
  const { data: p } = await db
    .from("products")
    .select("id, name, has_variants")
    .eq("business_id", businessId)
    .eq("id", productId)
    .maybeSingle();
  if (!p) return { error: "Product not found" };
  if (p.has_variants) return { error: "Variant products always track stock." };

  await db.from("products").update({ track_inventory: tracked }).eq("business_id", businessId).eq("id", productId);
  await writeAudit(businessId, user.id, "inventory.tracking_changed", {
    targetType: "product",
    targetId: productId,
    summary: `${tracked ? "Started" : "Stopped"} tracking stock for "${p.name}"`,
  });
  revalidatePath("/app/products");
  revalidatePath("/app/inventory");
  return { ok: true };
}

/** Bulk: set several products / variants to 0 stock (mark out of stock). */
export async function bulkMarkOutOfStock(
  items: { productId: string; variantId?: string | null }[],
): Promise<{ error: string } | { ok: true; count: number }> {
  const { businessId, user, db } = await requireBusiness();
  const list = (items ?? []).filter((i) => i && i.productId).slice(0, 300);
  if (!list.length) return { error: "Nothing selected." };

  const variantIds = list.filter((i) => i.variantId).map((i) => i.variantId as string);
  const productIds = [...new Set(list.filter((i) => !i.variantId).map((i) => i.productId))];
  const touchedProducts = new Set(list.map((i) => i.productId));

  if (variantIds.length) {
    await db.from("product_variants").update({ stock_qty: 0 }).eq("business_id", businessId).in("id", variantIds);
  }
  if (productIds.length) {
    await db
      .from("products")
      .update({ stock_qty: 0, track_inventory: true })
      .eq("business_id", businessId)
      .in("id", productIds);
  }
  // resync variant-product totals
  for (const pid of touchedProducts) {
    const { data: sib } = await db
      .from("product_variants")
      .select("stock_qty")
      .eq("business_id", businessId)
      .eq("product_id", pid)
      .eq("active", true);
    if (sib && sib.length) {
      await db
        .from("products")
        .update({ stock_qty: sib.reduce((s, r) => s + Number(r.stock_qty), 0) })
        .eq("id", pid);
    }
    await db.from("inventory_adjustments").insert({
      business_id: businessId,
      product_id: pid,
      variant_id: null,
      delta: 0,
      balance: 0,
      reason: "correction",
      note: "Bulk marked out of stock",
      created_by: user.id,
    });
  }

  await writeAudit(businessId, user.id, "inventory.bulk_out_of_stock", {
    targetType: "product",
    summary: `${list.length} items set to 0`,
  });
  revalidatePath("/app/inventory");
  revalidatePath("/app/products");
  return { ok: true, count: list.length };
}
