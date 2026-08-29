import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json().catch(() => ({}));
  const t = String(token ?? "");
  const pw = String(password ?? "");
  if (!t || pw.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const db = getAdminSupabase();
  const { data: row } = await db
    .from("password_reset_tokens")
    .select("token, user_id, expires_at, used_at")
    .eq("token", t)
    .maybeSingle();

  if (!row || row.used_at || new Date(row.expires_at as string) < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  await db.from("users").update({ password_hash: await hashPassword(pw) }).eq("id", row.user_id);
  await db.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("token", t);
  // invalidate any other outstanding tokens for this user
  await db.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("user_id", row.user_id).is("used_at", null);

  return NextResponse.json({ ok: true });
}
