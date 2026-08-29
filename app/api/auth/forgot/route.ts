import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAdminSupabase } from "@/lib/supabase";
import { sendEmail, emailLayout } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  const clean = String(email ?? "").toLowerCase().trim();
  // Always return success (don't reveal whether an account exists).
  if (!clean) return NextResponse.json({ ok: true });

  const db = getAdminSupabase();
  const { data: user } = await db.from("users").select("id, name").eq("email", clean).maybeSingle();

  if (user) {
    const token = randomBytes(24).toString("base64url");
    await db.from("password_reset_tokens").insert({
      token,
      user_id: user.id,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password?token=${token}`;
    await sendEmail({
      to: clean,
      subject: "Reset your Zotomic password",
      html: emailLayout(`
        <p style="margin:0 0 12px">Hi ${user.name ?? "there"}, click below to set a new password. The link expires in 1 hour.</p>
        <a href="${url}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:600;font-size:14px">Reset password →</a>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">If you didn't request this, ignore this email.</p>
      `),
    });
  }

  return NextResponse.json({ ok: true });
}
