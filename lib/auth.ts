import bcrypt from "bcryptjs";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Re-export edge-safe JWT helpers so existing imports keep working.
export { signToken, verifyToken, getRoleRedirect, type SessionClaims } from "./jwt";

const ENCRYPTION_KEY = (
  process.env.ENCRYPTION_KEY ?? "zotomic-dev-encryption-key-32char"
).slice(0, 32);

// ── PASSWORD ─────────────────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── AES-256-CBC — stored third-party credentials ────────────────────────────
export function encrypt(text: string): string {
  if (!text) return "";
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let enc = cipher.update(text, "utf8", "hex");
  enc += cipher.final("hex");
  return iv.toString("hex") + ":" + enc;
}

export function decrypt(encText: string): string {
  if (!encText || !encText.includes(":")) return "";
  const [ivHex] = encText.split(":");
  if (!/^[0-9a-f]{32}$/i.test(ivHex)) return "";
  try {
    const enc = encText.slice(ivHex.length + 1);
    const decipher = createDecipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY),
      Buffer.from(ivHex, "hex"),
    );
    let dec = decipher.update(enc, "hex", "utf8");
    dec += decipher.final("utf8");
    return dec;
  } catch {
    return "";
  }
}
