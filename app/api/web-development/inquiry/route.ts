import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { notifyAdmins } from "@/lib/notify";
import { createServiceInquiry } from "@/lib/service-inquiries";

interface InquiryBody {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}

/**
 * Public, unauthenticated lead capture for /web-development — anonymous
 * visitors shouldn't need a Zotomic account to ask about a website. Writes
 * into the same service_inquiries table the logged-in flow uses
 * (app/app/service-inquiries/actions.ts), whose user_id/business_id columns
 * are already nullable, so it lands in the same /admin/service-inquiries
 * inbox with no new admin surface needed.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "web-dev-inquiry", limit: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;

  try {
    const body = (await req.json()) as InquiryBody;
    if (!body.name?.trim() || !body.email?.trim() || !body.message?.trim()) {
      return NextResponse.json({ ok: false, error: "Name, email and a short brief are required." }, { status: 400 });
    }

    const result = await createServiceInquiry({
      service: "custom_website",
      message: `From: ${body.name.trim()}\n\n${body.message.trim().slice(0, 1900)}`,
      contactEmail: body.email.trim(),
      contactPhone: body.phone?.trim() || null,
      userId: null,
      businessId: null,
    });
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });

    await notifyAdmins("service_inquiry", {
      title: `Web development inquiry — ${body.name.trim()}`,
      body: body.message.trim().slice(0, 300),
      href: "/admin/service-inquiries",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("web-development inquiry route error:", e);
    return NextResponse.json({ ok: false, error: "Internal server error." }, { status: 500 });
  }
}
