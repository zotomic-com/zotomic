import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { signUpload, cloudinaryConfigured } from "@/lib/cloudinary";
import { enforceRateLimit } from "@/lib/ratelimit";

/** Signed Cloudinary upload for platform-wide site assets (logo, favicon) — admin only. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const limited = enforceRateLimit(req, {
    name: "admin-media-sign",
    key: admin.id,
    limit: 30,
    windowMs: 60_000,
    message: "Too many uploads at once. Wait a moment and continue.",
  });
  if (limited) return limited;

  if (!cloudinaryConfigured()) {
    return NextResponse.json({ error: "Media uploads are not configured." }, { status: 503 });
  }

  const sig = signUpload("platform/site");
  return NextResponse.json(sig);
}
