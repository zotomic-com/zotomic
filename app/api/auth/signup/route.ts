import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { hashPassword, signToken } from "@/lib/auth";
import { AUTH_COOKIE } from "@/lib/auth-server";
import { ga4ServerEvent } from "@/lib/platform-settings";

function gaClientId(req: NextRequest): string {
  const ga = req.cookies.get("_ga")?.value ?? "";
  const m = ga.match(/GA\d\.\d\.(\d+\.\d+)/);
  return m?.[1] ?? `${Date.now()}.${Math.floor(Math.random() * 1e9)}`;
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const db = getAdminSupabase();
    const cleanEmail = String(email).toLowerCase().trim();

    const { data: existing } = await db
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const password_hash = await hashPassword(password);

    const { data: user, error } = await db
      .from("users")
      .insert({
        name: String(name).trim(),
        email: cleanEmail,
        password_hash,
        role: "owner",
        status: "active",
      })
      .select("id, name, email, role")
      .single();

    if (error || !user) {
      console.error("Signup error:", error);
      return NextResponse.json({ error: "Could not create account" }, { status: 500 });
    }

    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    // Business + membership are created in /onboarding, not here.
    const res = NextResponse.json({
      success: true,
      redirect: "/onboarding",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    ga4ServerEvent(gaClientId(req), "sign_up", { method: "email" }).catch(() => {});
    return res;
  } catch (e) {
    console.error("Signup error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
