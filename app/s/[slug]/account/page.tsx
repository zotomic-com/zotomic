import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { AccountClient, type Address } from "./AccountClient";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);

  const account = await getStoreAccount(store.businessId);
  if (!account) redirect(`${basePath}/account/login`);

  const db = getAdminSupabase();
  const orFilter = account.customerId
    ? `store_account_id.eq.${account.id},customer_id.eq.${account.customerId}`
    : `store_account_id.eq.${account.id}`;

  const [{ data: orders }, { data: addresses }] = await Promise.all([
    db
      .from("orders")
      .select("order_number, total, status, placed_at")
      .eq("business_id", store.businessId)
      .or(orFilter)
      .order("placed_at", { ascending: false })
      .limit(50),
    db
      .from("store_account_addresses")
      .select("id, label, name, phone, address, city, area, is_default")
      .eq("account_id", account.id)
      .order("is_default", { ascending: false }),
  ]);

  const orderRows = (orders ?? []).map((o) => ({
    number: o.order_number as string,
    total: money(Number(o.total), store.currency),
    status: o.status as string,
    date: new Date(o.placed_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Hi, {account.name || "there"}</h1>
          <p className="text-sm text-[var(--sf-muted)]">{account.email}</p>
        </div>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">Orders</h2>
        {orderRows.length === 0 ? (
          <p className="text-sm text-[var(--sf-muted)]">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--sf-line)] rounded-[var(--sf-radius)] border border-[var(--sf-line)]">
            {orderRows.map((o) => (
              <li key={o.number} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <Link href={`${basePath}/order/${o.number}`} className="font-semibold">
                    #{o.number}
                  </Link>
                  <p className="text-xs text-[var(--sf-muted)]">{o.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{o.total}</p>
                  <p className="text-xs capitalize text-[var(--sf-muted)]">{o.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccountClient
        slug={slug}
        basePath={basePath}
        profile={{ name: account.name, email: account.email, phone: account.phone ?? "" }}
        addresses={(addresses ?? []) as Address[]}
      />
    </div>
  );
}
