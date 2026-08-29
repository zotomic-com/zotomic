import { NextRequest, NextResponse } from "next/server";
import { resolveTenant, isTenantError } from "@/lib/tenant";
import { getAdminSupabase } from "@/lib/supabase";
import { destroyAsset } from "@/lib/cloudinary";

/** Record an uploaded asset (browser uploads straight to Cloudinary, then calls this). */
export async function POST(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (isTenantError(tenant)) return tenant;

  const b = await req.json();
  if (!b.public_id || !b.url) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = getAdminSupabase();
  const { data, error } = await db
    .from("media_assets")
    .upsert(
      {
        business_id: tenant.businessId,
        public_id: String(b.public_id),
        url: String(b.url),
        width: b.width ?? null,
        height: b.height ?? null,
        bytes: b.bytes ?? null,
        format: b.format ?? null,
        folder: "products",
        created_by: tenant.user.id,
      },
      { onConflict: "business_id,public_id" },
    )
    .select("id, url, public_id")
    .single();

  if (error) return NextResponse.json({ error: "Could not save asset" }, { status: 500 });
  return NextResponse.json(data);
}

/** List this business's media. */
export async function GET(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (isTenantError(tenant)) return tenant;

  const db = getAdminSupabase();
  const { data } = await db
    .from("media_assets")
    .select("id, public_id, url, width, height, bytes, created_at")
    .eq("business_id", tenant.businessId)
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({ assets: data ?? [] });
}

/** Delete an asset (Cloudinary + row) — only if nothing references it. */
export async function DELETE(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (isTenantError(tenant)) return tenant;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getAdminSupabase();
  const { data: asset } = await db
    .from("media_assets")
    .select("public_id, url")
    .eq("business_id", tenant.businessId)
    .eq("id", id)
    .maybeSingle();
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: refs } = await db
    .from("products")
    .select("id")
    .eq("business_id", tenant.businessId)
    .contains("image_urls", [asset.url])
    .limit(1);
  if (refs && refs.length) {
    return NextResponse.json({ error: "In use by a product" }, { status: 409 });
  }

  await destroyAsset(asset.public_id as string);
  await db.from("media_assets").delete().eq("business_id", tenant.businessId).eq("id", id);
  return NextResponse.json({ ok: true });
}
