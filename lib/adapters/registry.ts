import { getAdminSupabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/auth";
import type { CourierProvider, PaymentProvider } from "./types";
import { bkash } from "./payment/bkash";
import { nagad, sslcommerz } from "./payment/stubs";
import { steadfast } from "./courier/steadfast";
import { pathao, redx } from "./courier/stubs";

export const PAYMENT_PROVIDERS: Record<string, PaymentProvider> = { bkash, nagad, sslcommerz };
export const COURIER_PROVIDERS: Record<string, CourierProvider> = { steadfast, pathao, redx };

export function paymentProvider(id: string): PaymentProvider | null {
  return PAYMENT_PROVIDERS[id] ?? null;
}
export function courierProvider(id: string): CourierProvider | null {
  return COURIER_PROVIDERS[id] ?? null;
}

export interface StoredIntegration {
  provider: string;
  category: "payment" | "courier";
  status: string;
  mode: "sandbox" | "live";
  config: Record<string, unknown>;
  creds: Record<string, string>;
  connectedAt: string | null;
  lastError: string | null;
}

/** Load + decrypt one integration for a business. */
export async function loadIntegration(
  businessId: string,
  provider: string,
): Promise<StoredIntegration | null> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("integrations")
    .select("provider, category, status, mode, config, credentials_encrypted, connected_at, last_error")
    .eq("business_id", businessId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;

  let creds: Record<string, string> = {};
  if (data.credentials_encrypted) {
    try {
      creds = JSON.parse(decrypt(data.credentials_encrypted as string) || "{}");
    } catch {
      creds = {};
    }
  }
  return {
    provider: data.provider as string,
    category: data.category as "payment" | "courier",
    status: data.status as string,
    mode: (data.mode as "sandbox" | "live") ?? "sandbox",
    config: (data.config as Record<string, unknown>) ?? {},
    creds,
    connectedAt: (data.connected_at as string) ?? null,
    lastError: (data.last_error as string) ?? null,
  };
}

export async function listIntegrations(businessId: string): Promise<StoredIntegration[]> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("integrations")
    .select("provider, category, status, mode, config, connected_at, last_error")
    .eq("business_id", businessId);
  return (data ?? []).map((d) => ({
    provider: d.provider as string,
    category: d.category as "payment" | "courier",
    status: d.status as string,
    mode: (d.mode as "sandbox" | "live") ?? "sandbox",
    config: (d.config as Record<string, unknown>) ?? {},
    creds: {},
    connectedAt: (d.connected_at as string) ?? null,
    lastError: (d.last_error as string) ?? null,
  }));
}

export async function saveIntegration(args: {
  businessId: string;
  provider: string;
  category: "payment" | "courier";
  mode: "sandbox" | "live";
  creds: Record<string, string>;
  status: "connected" | "error";
  lastError?: string | null;
}) {
  const db = getAdminSupabase();
  await db.from("integrations").upsert(
    {
      business_id: args.businessId,
      provider: args.provider,
      category: args.category,
      mode: args.mode,
      credentials_encrypted: encrypt(JSON.stringify(args.creds)),
      status: args.status,
      last_error: args.lastError ?? null,
      connected_at: args.status === "connected" ? new Date().toISOString() : null,
    },
    { onConflict: "business_id,provider" },
  );
}

export async function removeIntegration(businessId: string, provider: string) {
  const db = getAdminSupabase();
  await db.from("integrations").delete().eq("business_id", businessId).eq("provider", provider);
}
