"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { createOrder } from "@/lib/orders/create";
import { getAdminSupabase } from "@/lib/supabase";

export interface OrderImportRow {
  order_number?: string;
  customer_name?: string;
  customer_phone?: string;
  product?: string; // name or SKU
  qty?: string;
  status?: string;
  payment_method?: string;
  shipping?: string;
  date?: string;
}

const norm = (x: string) => x.toLowerCase().trim();

export async function importOrders(
  rows: OrderImportRow[],
): Promise<{ error: string } | { ok: true; created: number; skipped: number }> {
  const { businessId, user, business } = await requireBusiness();
  if (!Array.isArray(rows) || rows.length === 0) return { error: "Nothing to import" };
  if (rows.length > 2000) return { error: "Import is limited to 2000 rows at a time." };

  const db = getAdminSupabase();
  const { data: products } = await db
    .from("products")
    .select("id, name, sku")
    .eq("business_id", businessId);
  const byName = new Map<string, string>();
  for (const p of products ?? []) {
    byName.set(norm(p.name as string), p.id as string);
    if (p.sku) byName.set(norm(p.sku as string), p.id as string);
  }

  // group rows by order_number (or one order per row)
  const groups = new Map<string, OrderImportRow[]>();
  rows.forEach((r, i) => {
    const key = (r.order_number ?? "").trim() || `__row${i}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });

  let created = 0;
  let skipped = 0;
  for (const [key, groupRows] of groups) {
    const first = groupRows[0];
    const items = groupRows
      .map((r) => {
        const pid = byName.get(norm(r.product ?? ""));
        return pid ? { productId: pid, qty: Math.max(1, Math.round(Number(r.qty) || 1)) } : null;
      })
      .filter(Boolean) as { productId: string; qty: number }[];
    if (items.length === 0) {
      skipped++;
      continue;
    }

    const parsedDate = first.date ? new Date(first.date) : null;
    const res = await createOrder({
      businessId,
      currency: business?.currency ?? "BDT",
      channel: "import",
      status: ["pending", "confirmed", "processing", "shipped", "delivered", "returned", "cancelled"].includes(
        norm(first.status ?? ""),
      )
        ? norm(first.status ?? "")
        : "delivered",
      paymentMethod: ["cod", "bkash", "nagad", "sslcommerz", "other"].includes(norm(first.payment_method ?? ""))
        ? norm(first.payment_method ?? "")
        : "cod",
      paymentStatus: "paid",
      customer: {
        name: (first.customer_name ?? "Imported customer").trim(),
        phone: (first.customer_phone ?? `import-${key}`).trim(),
      },
      items,
      shipping: Number(first.shipping) || 0,
      orderNumber: key.startsWith("__row") ? undefined : key,
      placedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : undefined,
    });
    if ("error" in res) skipped++;
    else created++;
  }

  await writeAudit(businessId, user.id, "orders.imported", {
    targetType: "order",
    summary: `Imported ${created} orders from CSV (${skipped} skipped)`,
  });
  revalidatePath("/app/orders");
  return { ok: true, created, skipped };
}
