import { NextResponse } from "next/server";
import { AUTH_ROLE_COOKIE } from "@/lib/auth-role";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete("auth_token");
  res.cookies.delete(AUTH_ROLE_COOKIE);
  return res;
}
