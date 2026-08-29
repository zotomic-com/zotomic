import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "./jwt";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

const COOKIE = "auth_token";

/** Read + verify the session token from a request. Returns null if absent/invalid. */
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const token =
    req.cookies.get(COOKIE)?.value ??
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

/** Guard for API route handlers. Returns `{ user }` or a JSON error response. */
export async function requireAuth(
  req: NextRequest,
  allowedRoles?: string[],
): Promise<{ user: AuthUser } | NextResponse> {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { user };
}

export const AUTH_COOKIE = COOKIE;
