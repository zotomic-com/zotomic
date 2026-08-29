import { NextRequest, NextResponse } from "next/server";
import { resolveTenant, isTenantError } from "@/lib/tenant";
import { signUpload, cloudinaryConfigured } from "@/lib/cloudinary";

export async function POST(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (isTenantError(tenant)) return tenant;

  if (!cloudinaryConfigured()) {
    return NextResponse.json({ error: "Media uploads are not configured." }, { status: 503 });
  }

  const sig = signUpload(tenant.businessId);
  return NextResponse.json(sig);
}
