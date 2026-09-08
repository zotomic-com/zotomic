import { NextRequest, NextResponse } from "next/server";
import { resolveTenant, isTenantError } from "@/lib/tenant";
import { signUpload, cloudinaryConfigured } from "@/lib/cloudinary";
import { enforceRateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (isTenantError(tenant)) return tenant;

  const limited = enforceRateLimit(req, {
    name: "media-sign",
    key: tenant.businessId,
    limit: 60,
    windowMs: 60_000,
    message: "Too many uploads at once. Wait a moment and continue.",
  });
  if (limited) return limited;

  if (!cloudinaryConfigured()) {
    return NextResponse.json({ error: "Media uploads are not configured." }, { status: 503 });
  }

  const sig = signUpload(tenant.businessId);
  return NextResponse.json(sig);
}
