"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { getEntitlements } from "@/lib/entitlements";
import {
  courierProvider,
  paymentProvider,
  removeIntegration,
  saveIntegration,
} from "@/lib/adapters/registry";
import {
  messagingProvider,
  saveChannel,
  removeChannel,
  type MessagingProviderId,
} from "@/lib/messaging";
import { setStoreTracking } from "@/lib/store-tracking";

type Category = "payment" | "courier";

export async function connectIntegration(input: {
  category: Category;
  provider: string;
  mode: "sandbox" | "live";
  creds: Record<string, string>;
}) {
  const { businessId, user } = await requireBusiness();

  if (input.category === "payment") {
    const ent = await getEntitlements(businessId);
    if (!ent.payment_gateway) {
      return { error: "Payment gateways are available on the Business plan. Contact us to upgrade." };
    }
  }

  const provider =
    input.category === "payment" ? paymentProvider(input.provider) : courierProvider(input.provider);
  if (!provider) return { error: "Unknown provider" };

  const cleanCreds: Record<string, string> = {};
  for (const f of provider.credentialFields) {
    cleanCreds[f.key] = String(input.creds[f.key] ?? "").trim();
    if (!cleanCreds[f.key]) return { error: `${f.label} is required` };
  }

  const check = await provider.validate(cleanCreds, input.mode);
  await saveIntegration({
    businessId,
    provider: input.provider,
    category: input.category,
    mode: input.mode,
    creds: cleanCreds,
    status: check.ok ? "connected" : "error",
    lastError: check.ok ? null : check.error ?? "Validation failed",
  });

  await writeAudit(businessId, user.id, `integration.${check.ok ? "connected" : "connect_failed"}`, {
    targetType: "integration",
    targetId: input.provider,
    summary: `${provider.name} (${input.mode})`,
  });

  revalidatePath("/app/integrations");
  return check.ok ? { ok: true } : { error: check.error ?? "Could not validate credentials" };
}

export async function disconnectIntegration(provider: string) {
  const { businessId, user } = await requireBusiness();
  await removeIntegration(businessId, provider);
  await writeAudit(businessId, user.id, "integration.disconnected", {
    targetType: "integration",
    targetId: provider,
  });
  revalidatePath("/app/integrations");
  return { ok: true };
}

// ── messaging (Messenger / WhatsApp / Instagram) — every plan ───────────────

export async function connectMessaging(input: {
  provider: MessagingProviderId;
  creds: Record<string, string>;
}): Promise<{ error: string } | { ok: true; verifyToken: string; webhookUrl: string }> {
  const { businessId, user } = await requireBusiness();
  const def = messagingProvider(input.provider);
  if (!def) return { error: "Unknown channel" };

  const idField = def.fields[0].key;
  const externalId = String(input.creds[idField] ?? "").trim();
  const clean: Record<string, string> = {};
  for (const f of def.fields) {
    const v = String(input.creds[f.key] ?? "").trim();
    if (!v && !f.optional) return { error: `${f.label} is required` };
    if (v) clean[f.key] = v;
  }

  const channel = await saveChannel({
    businessId,
    provider: input.provider,
    externalId,
    displayName: def.name,
    creds: clean,
  });

  await writeAudit(businessId, user.id, "messaging.connected", {
    targetType: "messaging_channel",
    targetId: input.provider,
    summary: def.name,
  });

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com").replace(/\/$/, "");
  revalidatePath("/app/integrations");
  return { ok: true, verifyToken: channel.verifyToken, webhookUrl: `${base}/api/webhooks/meta/${businessId}` };
}

export async function disconnectMessaging(provider: string) {
  const { businessId, user } = await requireBusiness();
  await removeChannel(businessId, provider);
  await writeAudit(businessId, user.id, "messaging.disconnected", {
    targetType: "messaging_channel",
    targetId: provider,
  });
  revalidatePath("/app/integrations");
  return { ok: true };
}

// ── tracking / pixels — every plan ─────────────────────────────────────────

export async function saveTrackingSettings(input: {
  metaPixelId: string;
  ga4MeasurementId: string;
  metaCapiToken: string;
}) {
  const { businessId, user } = await requireBusiness();
  const clean = {
    metaPixelId: input.metaPixelId.trim().slice(0, 32),
    ga4MeasurementId: input.ga4MeasurementId.trim().slice(0, 32),
    metaCapiToken: input.metaCapiToken.trim(),
  };
  await setStoreTracking(businessId, clean);
  await writeAudit(businessId, user.id, "tracking.updated", {
    targetType: "tracking",
    summary: `Pixel ${clean.metaPixelId || "—"} · GA4 ${clean.ga4MeasurementId || "—"}`,
  });
  revalidatePath("/app/integrations");
  revalidatePath("/app/storefront");
  return { ok: true };
}
