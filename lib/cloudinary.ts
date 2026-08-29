import { createHash } from "crypto";

/**
 * Cloudinary — server-side signing only. The API secret never leaves the server.
 * Browsers upload directly to Cloudinary using a signature minted here.
 */

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const API_KEY = process.env.CLOUDINARY_API_KEY ?? "";
const API_SECRET = process.env.CLOUDINARY_API_SECRET ?? "";

export function cloudinaryConfigured(): boolean {
  return !!(CLOUD && API_KEY && API_SECRET);
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

/** Sign an upload for a given tenant folder. */
export function signUpload(businessId: string): UploadSignature | null {
  if (!cloudinaryConfigured()) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `zotomic/${businessId}`;
  // Cloudinary signs the alphabetically-sorted params (excluding file/api_key/resource_type).
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(toSign + API_SECRET).digest("hex");
  return { cloudName: CLOUD, apiKey: API_KEY, timestamp, folder, signature };
}

export interface DestroyResult {
  ok: boolean;
}

/** Delete an asset by public_id (used by media cleanup). */
export async function destroyAsset(publicId: string): Promise<DestroyResult> {
  if (!cloudinaryConfigured()) return { ok: false };
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`)
    .digest("hex");
  const form = new URLSearchParams({
    public_id: publicId,
    api_key: API_KEY,
    timestamp: String(timestamp),
    signature,
  });
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/destroy`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return { ok: data.result === "ok" || data.result === "not found" };
  } catch {
    return { ok: false };
  }
}

/** Cloudinary auto-format/quality delivery URL for a public_id. */
export function optimized(publicId: string, w = 800): string {
  return `https://res.cloudinary.com/${CLOUD}/image/upload/f_auto,q_auto,w_${w},c_limit/${publicId}`;
}

/** Insert responsive transforms into an existing Cloudinary URL; pass others through. */
export function cldUrl(url: string | null | undefined, w = 800): string {
  if (!url) return "";
  const marker = "/image/upload/";
  const i = url.indexOf(marker);
  if (i === -1 || !url.includes("res.cloudinary.com")) return url;
  const after = url.slice(i + marker.length);
  // don't double-transform
  if (/^(f_auto|q_auto|w_\d|c_)/.test(after)) return url;
  return `${url.slice(0, i + marker.length)}f_auto,q_auto,w_${w},c_limit/${after}`;
}
