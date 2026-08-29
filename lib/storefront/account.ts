import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getAdminSupabase } from "@/lib/supabase";
import { hashPassword, comparePassword } from "@/lib/auth";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_JWT_SECRET ?? "zotomic-dev-only-secret-change-in-production-please",
);
export const STORE_COOKIE = "zt_store";

interface StoreClaims {
  aid: string;
  bid: string;
  email: string;
  name: string;
}

export interface StoreAccount {
  id: string;
  businessId: string;
  name: string;
  email: string;
  phone: string | null;
  customerId: string | null;
}

async function sign(c: StoreClaims) {
  return new SignJWT({ ...c })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function setStoreSession(a: { id: string; businessId: string; email: string; name: string }) {
  const token = await sign({ aid: a.id, bid: a.businessId, email: a.email, name: a.name });
  (await cookies()).set(STORE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearStoreSession() {
  (await cookies()).set(STORE_COOKIE, "", { path: "/", maxAge: 0 });
}

/** Current shopper for THIS store (null if not logged in or logged into another store). */
export async function getStoreAccount(businessId: string): Promise<StoreAccount | null> {
  const token = (await cookies()).get(STORE_COOKIE)?.value;
  if (!token) return null;
  let claims: StoreClaims;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    claims = payload as unknown as StoreClaims;
  } catch {
    return null;
  }
  if (claims.bid !== businessId) return null;

  const db = getAdminSupabase();
  const { data } = await db
    .from("store_accounts")
    .select("id, business_id, name, email, phone, customer_id")
    .eq("id", claims.aid)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    businessId: data.business_id as string,
    name: (data.name as string) ?? "",
    email: data.email as string,
    phone: (data.phone as string) ?? null,
    customerId: (data.customer_id as string) ?? null,
  };
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function registerStoreAccount(input: {
  businessId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<{ error: string } | { ok: true; account: { id: string; email: string; name: string } }> {
  const name = input.name.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  const phone = input.phone.trim().slice(0, 32);
  if (!name) return { error: "Enter your name." };
  if (!emailOk(email)) return { error: "Enter a valid email." };
  if (input.password.length < 8) return { error: "Password must be at least 8 characters." };

  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("store_accounts")
    .select("id")
    .eq("business_id", input.businessId)
    .eq("email", email)
    .maybeSingle();
  if (existing) return { error: "An account with this email already exists. Sign in instead." };

  // link to an existing CRM customer by phone if we have one
  let customerId: string | null = null;
  if (phone) {
    const { data: cust } = await db
      .from("customers")
      .select("id")
      .eq("business_id", input.businessId)
      .eq("phone", phone)
      .maybeSingle();
    customerId = (cust?.id as string) ?? null;
  }

  const { data, error } = await db
    .from("store_accounts")
    .insert({
      business_id: input.businessId,
      customer_id: customerId,
      name,
      email,
      phone: phone || null,
      password_hash: await hashPassword(input.password),
      last_login_at: new Date().toISOString(),
    })
    .select("id, email, name")
    .single();
  if (error || !data) return { error: "Could not create the account." };
  return { ok: true, account: { id: data.id as string, email: data.email as string, name: data.name as string } };
}

export async function loginStoreAccount(input: {
  businessId: string;
  email: string;
  password: string;
}): Promise<{ error: string } | { ok: true; account: { id: string; email: string; name: string } }> {
  const email = input.email.trim().toLowerCase();
  const db = getAdminSupabase();
  const { data } = await db
    .from("store_accounts")
    .select("id, email, name, password_hash")
    .eq("business_id", input.businessId)
    .eq("email", email)
    .maybeSingle();
  if (!data || !(await comparePassword(input.password, data.password_hash as string))) {
    return { error: "Wrong email or password." };
  }
  await db.from("store_accounts").update({ last_login_at: new Date().toISOString() }).eq("id", data.id);
  return { ok: true, account: { id: data.id as string, email: data.email as string, name: data.name as string } };
}
