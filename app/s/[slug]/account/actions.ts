"use server";

import { revalidatePath } from "next/cache";
import { getStoreBySlug } from "@/lib/storefront/store";
import { getAdminSupabase } from "@/lib/supabase";
import {
  getStoreAccount,
  loginStoreAccount,
  registerStoreAccount,
  setStoreSession,
  clearStoreSession,
  createStoreAccountReset,
  resetStoreAccountPassword,
  changeStoreAccountPassword,
} from "@/lib/storefront/account";
import {
  addServerWishlist,
  removeServerWishlist,
  mergeServerWishlist,
} from "@/lib/storefront/wishlist";
import { canCancel, withinReturnWindow, type OrderStatus, type ReorderItem } from "@/lib/storefront/order-status";

async function biz(slug: string) {
  const store = await getStoreBySlug(slug);
  if (!store || !store.published) return null;
  return store;
}

export async function registerAction(slug: string, form: FormData, wishIds?: string[]) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  const res = await registerStoreAccount({
    businessId: store.businessId,
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    phone: String(form.get("phone") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if ("error" in res) return res;
  await setStoreSession({ ...res.account, businessId: store.businessId });
  if (wishIds?.length) await mergeServerWishlist(store.businessId, res.account.id, wishIds).catch(() => {});

  void import("@/lib/emails")
    .then(({ sendStoreAccountWelcome }) =>
      sendStoreAccountWelcome({
        to: res.account.email,
        name: res.account.name,
        storeName: store.name,
        accountUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com"}/s/${slug}/account`,
      }),
    )
    .catch(() => {});

  return { ok: true };
}

export async function loginAction(slug: string, form: FormData, wishIds?: string[]) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  const res = await loginStoreAccount({
    businessId: store.businessId,
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if ("error" in res) return res;
  await setStoreSession({ ...res.account, businessId: store.businessId });
  if (wishIds?.length) await mergeServerWishlist(store.businessId, res.account.id, wishIds).catch(() => {});
  return { ok: true };
}

/* ─────────────────────────────  password reset  ───────────────────────────── */

export async function requestPasswordResetAction(slug: string, email: string) {
  const store = await biz(slug);
  if (!store) return { ok: true }; // stay silent
  const issued = await createStoreAccountReset(store.businessId, email);
  if (issued) {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com";
    const resetUrl = `${base}/s/${slug}/account/reset?token=${encodeURIComponent(issued.token)}`;
    void import("@/lib/emails")
      .then(({ sendStoreAccountReset }) =>
        sendStoreAccountReset({ to: issued.email, name: issued.name, storeName: store.name, resetUrl }),
      )
      .catch(() => {});
  }
  return { ok: true };
}

export async function resetPasswordAction(slug: string, token: string, password: string) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  return resetStoreAccountPassword(store.businessId, token, password);
}

export async function changePasswordAction(slug: string, currentPassword: string, newPassword: string) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  const account = await getStoreAccount(store.businessId);
  if (!account) return { error: "Not signed in" };
  return changeStoreAccountPassword(account.id, currentPassword, newPassword);
}

/* ────────────────────────────────  wishlist  ─────────────────────────────── */

export async function toggleWishlistAction(slug: string, productId: string, on: boolean) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  const account = await getStoreAccount(store.businessId);
  if (!account) return { ok: true }; // guest — localStorage only
  if (on) await addServerWishlist(store.businessId, account.id, productId);
  else await removeServerWishlist(account.id, productId);
  revalidatePath(`/s/${slug}/account/wishlist`);
  return { ok: true };
}

export async function mergeWishlistAction(slug: string, productIds: string[]) {
  const store = await biz(slug);
  if (!store) return { ok: true };
  const account = await getStoreAccount(store.businessId);
  if (!account) return { ok: true };
  await mergeServerWishlist(store.businessId, account.id, productIds);
  return { ok: true };
}

/* ─────────────────────────────  order actions  ───────────────────────────── */

async function scopedOrder(slug: string, orderNumber: string) {
  const store = await biz(slug);
  if (!store) return { ok: false as const, error: "Store unavailable" };
  const account = await getStoreAccount(store.businessId);
  if (!account) return { ok: false as const, error: "Not signed in" };
  const db = getAdminSupabase();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, status, store_account_id, customer_id, delivered_at, business_id")
    .eq("business_id", store.businessId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return { ok: false as const, error: "Order not found" };
  const mine =
    order.store_account_id === account.id ||
    (account.customerId != null && order.customer_id === account.customerId);
  if (!mine) return { ok: false as const, error: "Order not found" };
  return { ok: true as const, store, account, order, db };
}

/** Build a fresh cart payload from a past order (current prices + stock). */
export async function reorderAction(
  slug: string,
  orderNumber: string,
): Promise<{ error: string } | { ok: true; items: ReorderItem[]; issues: string[] }> {
  const ctx = await scopedOrder(slug, orderNumber);
  if (!ctx.ok) return { error: ctx.error };
  const { store, order, db } = ctx;

  const { data: rawItems } = await db
    .from("order_items")
    .select("product_id, variant_id, qty, name")
    .eq("order_id", order.id);
  const items = rawItems ?? [];
  if (!items.length) return { error: "This order has no items." };

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean) as string[])];
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter(Boolean) as string[])];

  const [{ data: products }, { data: variants }] = await Promise.all([
    db
      .from("products")
      .select("id, name, slug, price, sale_price, image_urls, stock_qty, track_inventory, status, visible")
      .eq("business_id", store.businessId)
      .in("id", productIds.length ? productIds : ["-"]),
    variantIds.length
      ? db
          .from("product_variants")
          .select("id, product_id, name, price, sale_price, stock_qty, active")
          .eq("business_id", store.businessId)
          .in("id", variantIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const pMap = new Map((products ?? []).map((p) => [p.id as string, p]));
  const vMap = new Map((variants ?? []).map((v) => [v.id as string, v]));

  const out: ReorderItem[] = [];
  const issues: string[] = [];
  for (const it of items) {
    const p = it.product_id ? pMap.get(it.product_id) : undefined;
    if (!p || p.status !== "active" || p.visible === false) {
      issues.push(`${it.name} is no longer available`);
      continue;
    }
    const v = it.variant_id ? vMap.get(it.variant_id) : undefined;
    if (it.variant_id && (!v || v.active === false)) {
      issues.push(`${it.name} option is no longer available`);
      continue;
    }
    const base = v && v.price != null ? Number(v.price) : Number(p.price);
    const sale = v ? (v.sale_price == null ? null : Number(v.sale_price)) : p.sale_price == null ? null : Number(p.sale_price);
    const unit = sale != null && sale < base ? sale : base;
    const tracked = v ? true : Boolean(p.track_inventory);
    const stock = v ? Number(v.stock_qty) : Number(p.stock_qty);
    if (tracked && stock <= 0) {
      issues.push(`${it.name} is out of stock`);
      continue;
    }
    const want = Math.max(1, Number(it.qty) || 1);
    const qty = tracked ? Math.min(want, stock) : want;
    if (qty < want) issues.push(`${it.name}: only ${stock} left, added ${qty}`);
    const imgs = Array.isArray(p.image_urls) ? (p.image_urls as string[]) : [];
    out.push({
      id: v ? (v.id as string) : (p.id as string),
      productId: p.id as string,
      variantId: v ? (v.id as string) : undefined,
      variantLabel: v ? (v.name as string) : undefined,
      name: v ? `${p.name} — ${v.name}` : (p.name as string),
      price: unit,
      image: imgs[0] ?? null,
      slug: p.slug as string,
      qty,
    });
  }
  if (!out.length) return { error: issues[0] ?? "Nothing from this order can be reordered." };
  return { ok: true, items: out, issues };
}

export async function cancelOrderAction(
  slug: string,
  orderNumber: string,
  reason: string,
): Promise<{ error: string } | { ok: true }> {
  const ctx = await scopedOrder(slug, orderNumber);
  if (!ctx.ok) return { error: ctx.error };
  const { store, account, order, db } = ctx;

  if (!canCancel(order.status as OrderStatus)) {
    return { error: "This order can no longer be cancelled — contact the store." };
  }
  const cleanReason = reason.trim().slice(0, 500);
  await db
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "customer",
      cancel_reason: cleanReason || "Cancelled by customer",
    })
    .eq("id", order.id);

  // return the reserved stock to the shelf (mirror of checkout's decrement)
  const { data: its } = await db
    .from("order_items")
    .select("product_id, variant_id, qty")
    .eq("order_id", order.id);
  for (const it of its ?? []) {
    if (it.variant_id) {
      const { data: v } = await db.from("product_variants").select("stock_qty").eq("id", it.variant_id).maybeSingle();
      if (v) await db.from("product_variants").update({ stock_qty: Number(v.stock_qty) + Number(it.qty) }).eq("id", it.variant_id);
    } else if (it.product_id) {
      const { data: p } = await db.from("products").select("stock_qty, track_inventory").eq("id", it.product_id).maybeSingle();
      if (p?.track_inventory) await db.from("products").update({ stock_qty: Number(p.stock_qty) + Number(it.qty) }).eq("id", it.product_id);
    }
  }

  const { notifyOwner } = await import("@/lib/notify");
  await notifyOwner(store.businessId, "order_cancelled", {
    title: `Order ${order.order_number} cancelled by the customer`,
    body: `${account.name || account.email} cancelled their order.${cleanReason ? ` Reason: ${cleanReason}` : ""}`,
    href: `/app/orders/${order.id}`,
    email: { account: "admin" },
  });

  revalidatePath(`/s/${slug}/account/orders/${orderNumber}`);
  revalidatePath(`/s/${slug}/account/orders`);
  return { ok: true };
}

export async function requestReturnAction(
  slug: string,
  orderNumber: string,
  reason: string,
  note: string,
): Promise<{ error: string } | { ok: true; returnNumber: string }> {
  const ctx = await scopedOrder(slug, orderNumber);
  if (!ctx.ok) return { error: ctx.error };
  const { store, account, order, db } = ctx;

  if (order.status !== "delivered") return { error: "Returns can only be requested after delivery." };
  if (!withinReturnWindow(order.delivered_at as string | null)) {
    return { error: "The return window for this order has closed." };
  }
  const { data: existing } = await db
    .from("returns")
    .select("id, status")
    .eq("business_id", store.businessId)
    .eq("order_id", order.id)
    .not("status", "in", "(rejected,cancelled)")
    .maybeSingle();
  if (existing) return { error: "There's already a return request for this order." };

  const cleanReason = reason.trim().slice(0, 300);
  if (cleanReason.length < 3) return { error: "Tell the store why you're returning it." };

  const returnNumber = `RMA-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const { error } = await db.from("returns").insert({
    business_id: store.businessId,
    order_id: order.id,
    return_number: returnNumber,
    status: "requested",
    reason: cleanReason,
    note: note.trim().slice(0, 500) || null,
    source: "customer",
    restock: true,
    refund_amount: 0,
  });
  if (error) return { error: "Could not submit the request. Try again." };

  const { notifyOwner } = await import("@/lib/notify");
  await notifyOwner(store.businessId, "return_request", {
    title: `Return requested — order ${order.order_number}`,
    body: `${account.name || account.email}: ${cleanReason}`,
    href: "/app/returns",
    email: { account: "admin" },
  });

  revalidatePath(`/s/${slug}/account/orders/${orderNumber}`);
  return { ok: true, returnNumber };
}

export async function logoutAction() {
  await clearStoreSession();
  return { ok: true };
}

export async function updateProfileAction(slug: string, form: FormData) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  const account = await getStoreAccount(store.businessId);
  if (!account) return { error: "Not signed in" };
  const db = getAdminSupabase();
  await db
    .from("store_accounts")
    .update({
      name: String(form.get("name") ?? account.name).trim().slice(0, 120),
      phone: String(form.get("phone") ?? "").trim().slice(0, 32) || null,
    })
    .eq("id", account.id);
  revalidatePath(`/s/${slug}/account`);
  return { ok: true };
}

export async function saveNotificationPrefsAction(slug: string, form: FormData) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  const account = await getStoreAccount(store.businessId);
  if (!account) return { error: "Not signed in" };
  const { sanitizePrefs, CUSTOMER_EVENTS } = await import("@/lib/notify-events");
  const prefs = sanitizePrefs(CUSTOMER_EVENTS, {
    order_updates: { email: form.get("order_updates") === "on" },
    review_invite: { email: form.get("review_invite") === "on" },
    marketing: { email: form.get("marketing") === "on" },
  });
  await getAdminSupabase().from("store_accounts").update({ notification_prefs: prefs }).eq("id", account.id);
  revalidatePath(`/s/${slug}/account`);
  return { ok: true };
}

export async function saveAddressAction(slug: string, form: FormData) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  const account = await getStoreAccount(store.businessId);
  if (!account) return { error: "Not signed in" };
  const db = getAdminSupabase();

  const id = String(form.get("id") ?? "");
  const row = {
    business_id: store.businessId,
    account_id: account.id,
    label: String(form.get("label") ?? "").slice(0, 40) || null,
    name: String(form.get("name") ?? "").slice(0, 120) || null,
    phone: String(form.get("phone") ?? "").slice(0, 32) || null,
    address: String(form.get("address") ?? "").slice(0, 500) || null,
    city: String(form.get("city") ?? "").slice(0, 80) || null,
    area: String(form.get("area") ?? "").slice(0, 80) || null,
    is_default: form.get("is_default") === "on",
  };
  if (row.is_default) {
    await db.from("store_account_addresses").update({ is_default: false }).eq("account_id", account.id);
  }
  if (id) await db.from("store_account_addresses").update(row).eq("id", id).eq("account_id", account.id);
  else await db.from("store_account_addresses").insert(row);

  revalidatePath(`/s/${slug}/account`);
  return { ok: true };
}

export async function deleteAddressAction(slug: string, id: string) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  const account = await getStoreAccount(store.businessId);
  if (!account) return { error: "Not signed in" };
  await getAdminSupabase()
    .from("store_account_addresses")
    .delete()
    .eq("id", id)
    .eq("account_id", account.id);
  revalidatePath(`/s/${slug}/account`);
  return { ok: true };
}
