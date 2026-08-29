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
