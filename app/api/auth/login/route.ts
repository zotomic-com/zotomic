import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { comparePassword, signToken } from "@/lib/auth";
import { AUTH_COOKIE } from "@/lib/auth-server";
import { enforceRateLimit, clientIp } from "@/lib/ratelimit";
import { isIpBlocked, logLoginEvent } from "@/lib/admin/security";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    name: "login",
    limit: 10,
    windowMs: 5 * 60_000,
    message: "Too many sign-in attempts. Wait a few minutes and try again.",
  });
  if (limited) return limited;

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    const cleanEmail = String(email).toLowerCase().trim();

    if (await isIpBlocked(ip)) {
      await logLoginEvent({ email: cleanEmail, ip, ua, outcome: "ip_blocked" });
      return NextResponse.json({ error: "Access from your network has been blocked. Contact support." }, { status: 403 });
    }

    const db = getAdminSupabase();
    const { data: user, error } = await db
      .from("users")
      .select("id, name, email, password_hash, role, status, blocked, blocked_reason")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (error || !user) {
      await logLoginEvent({ email: cleanEmail, ip, ua, outcome: "not_found" });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    if (user.blocked) {
      await logLoginEvent({ userId: user.id, email: cleanEmail, ip, ua, outcome: "blocked" });
      return NextResponse.json(
        { error: (user.blocked_reason as string) || "Your account has been blocked. Contact support." },
        { status: 403 },
      );
    }
    if (user.status === "suspended") {
      await logLoginEvent({ userId: user.id, email: cleanEmail, ip, ua, outcome: "suspended" });
      return NextResponse.json({ error: "Your account has been suspended. Contact support." }, { status: 403 });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      await logLoginEvent({ userId: user.id, email: cleanEmail, ip, ua, outcome: "bad_password" });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await db
      .from("users")
      .update({ last_login: new Date().toISOString(), last_ip: ip })
      .eq("id", user.id);
    await logLoginEvent({ userId: user.id, email: cleanEmail, ip, ua, outcome: "success" });

    const token = await signToken({ id: user.id, email: user.email, role: user.role, name: user.name });

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
