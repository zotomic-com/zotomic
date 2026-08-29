import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { sendContactMessage } from "@/lib/emails";
import { ga4ServerEvent } from "@/lib/platform-settings";

interface ContactBody {
  name?: string;
  email?: string;
  phone?: string;
  business?: string;
  message?: string;
  topic?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ContactBody;

    if (!body.name || !body.email || !body.message) {
      return NextResponse.json(
        { success: false, error: "Name, email and message are required." },
        { status: 400 },
      );
    }

    try {
      const db = getAdminSupabase();
      await db.from("contact_messages").insert({
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        business: body.business ?? null,
        topic: body.topic ?? null,
        message: body.message,
      });
    } catch (e) {
      console.error("contact_messages insert failed:", e);
    }

    await sendContactMessage({
      name: body.name,
      email: body.email,
      phone: body.phone,
      business: body.business,
      topic: body.topic,
      message: body.message,
    });

    const ga = req.cookies.get("_ga")?.value ?? "";
    const cid = ga.match(/GA\d\.\d\.(\d+\.\d+)/)?.[1] ?? `${Date.now()}.0`;
    ga4ServerEvent(cid, "generate_lead", { topic: body.topic ?? "contact" }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("contact route error:", e);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
