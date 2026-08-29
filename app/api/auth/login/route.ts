import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { comparePassword, signToken } from "@/lib/auth";
import { AUTH_COOKIE } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const db = getAdminSupabase();
    const { data: user, error } = await db
      .from("users")
      .select("id, name, email, password_hash, role, status")
      .eq("email", String(email).toLowerCase().trim())
      .maybeSingle();

    if (error || !user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    if (user.status === "suspended") {
      return NextResponse.json({ error: "Your account has been suspended. Contact support." }, { status: 403 });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await db.from("users").update({ last_login: new Date().toISOString() }).eq("id", user.id);

    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    let redirect = user.role === "admin" ? "/admin" : "/app";
    if (user.role === "owner") {
      const { count } = await db
        .from("business_members")
        .select("business_id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (!count) redirect = "/onboarding";
    }

    const res = NextResponse.json({
      success: true,
      redirect,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return res;
  } catch (e) {
    console.error("Login error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
