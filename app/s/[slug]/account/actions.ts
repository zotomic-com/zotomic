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
} from "@/lib/storefront/account";

async function biz(slug: string) {
  const store = await getStoreBySlug(slug);
  if (!store || !store.published) return null;
  return store;
}

export async function registerAction(slug: string, form: FormData) {
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
  return { ok: true };
}

export async function loginAction(slug: string, form: FormData) {
  const store = await biz(slug);
  if (!store) return { error: "Store unavailable" };
  const res = await loginStoreAccount({
    businessId: store.businessId,
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if ("error" in res) return res;
  await setStoreSession({ ...res.account, businessId: store.businessId });
  return { ok: true };
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
