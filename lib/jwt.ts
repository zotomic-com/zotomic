import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_JWT_SECRET ?? "zotomic-dev-only-secret-change-in-production-please",
);

export interface SessionClaims {
  id: string;
  email: string;
  role: string;
  name: string;
}

export async function signToken(payload: SessionClaims): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionClaims;
  } catch {
    return null;
  }
}

export function getRoleRedirect(role: string): string {
  return role === "admin" ? "/admin" : "/app";
}
