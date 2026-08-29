import { NextResponse } from "next/server";
import { getStoreBySlug } from "@/lib/storefront/store";
import { getStoreAccount } from "@/lib/storefront/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight session check for the storefront header (keeps pages cacheable). */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("store") ?? "";
  if (!slug) return NextResponse.json({ loggedIn: false });
  const store = await getStoreBySlug(slug);
  if (!store) return NextResponse.json({ loggedIn: false });
  const account = await getStoreAccount(store.businessId);
  return NextResponse.json(
    account ? { loggedIn: true, name: account.name } : { loggedIn: false },
    { headers: { "cache-control": "private, no-store" } },
  );
}
