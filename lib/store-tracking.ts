import { getAdminSupabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/auth";

/**
 * Per-store tracking config — available on EVERY plan.
 *
 *  - Public pixel / measurement IDs live in `storefront_config.tracking`
 *    (they are rendered client-side by the storefront anyway).
 *  - The Meta Conversions API token is a secret → kept in `integrations`
 *    (AES-encrypted, provider `meta_capi`), never sent to the browser.
 */
export interface StoreTracking {
  metaPixelId: string;
  ga4MeasurementId: string;
  metaCapiToken: string;
}

export async function getStoreTracking(businessId: string): Promise<StoreTracking> {
  const db = getAdminSupabase();
  const [{ data: cfg }, { data: capi }] = await Promise.all([
    db.from("storefront_config").select("published_json, draft_json").eq("business_id", businessId).maybeSingle(),
    db
      .from("integrations")
      .select("credentials_encrypted")
      .eq("business_id", businessId)
      .eq("provider", "meta_capi")
      .maybeSingle(),
  ]);

  const t =
    ((cfg?.published_json as { tracking?: Record<string, string> } | null)?.tracking) ??
    ((cfg?.draft_json as { tracking?: Record<string, string> } | null)?.tracking) ??
    {};

  let metaCapiToken = "";
  if (capi?.credentials_encrypted) {
    try {
      metaCapiToken = JSON.parse(decrypt(capi.credentials_encrypted as string) || "{}").token ?? "";
    } catch {
      /* ignore */
    }
  }

  return {
    metaPixelId: t.metaPixelId ?? "",
    ga4MeasurementId: t.ga4MeasurementId ?? "",
    metaCapiToken,
  };
}

export async function setStoreTracking(
  businessId: string,
  input: { metaPixelId: string; ga4MeasurementId: string; metaCapiToken: string },
) {
  const db = getAdminSupabase();
  const { data: row } = await db
    .from("storefront_config")
    .select("id, draft_json, published_json")
    .eq("business_id", businessId)
    .maybeSingle();

  const patch = (j: unknown) => {
    const obj = (j && typeof j === "object" ? { ...(j as Record<string, unknown>) } : {}) as Record<string, unknown>;
    obj.tracking = {
      ...((obj.tracking as Record<string, unknown>) ?? {}),
      metaPixelId: input.metaPixelId,
      ga4MeasurementId: input.ga4MeasurementId,
    };
    return obj;
  };

  if (row) {
    await db
      .from("storefront_config")
      .update({
        draft_json: patch(row.draft_json),
        // only touch published tracking if the store has been published
        published_json: row.published_json ? patch(row.published_json) : row.published_json,
      })
      .eq("id", row.id);
  } else {
    await db.from("storefront_config").insert({
      business_id: businessId,
      draft_json: { tracking: { metaPixelId: input.metaPixelId, ga4MeasurementId: input.ga4MeasurementId } },
    });
  }

  // secret CAPI token → integrations
  if (input.metaCapiToken) {
    await db.from("integrations").upsert(
      {
        business_id: businessId,
        provider: "meta_capi",
        category: "tracking",
        status: "connected",
        credentials_encrypted: encrypt(JSON.stringify({ token: input.metaCapiToken })),
        connected_at: new Date().toISOString(),
      },
      { onConflict: "business_id,provider" },
    );
  } else {
    await db.from("integrations").delete().eq("business_id", businessId).eq("provider", "meta_capi");
  }
}
