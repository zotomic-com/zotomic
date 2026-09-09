import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Heart, MapPin, Package } from "lucide-react";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { listCustomerOrders, customerOrderStats } from "@/lib/storefront/customer-orders";
import { getServerWishlist } from "@/lib/storefront/wishlist";
import { StatusBadge } from "../_components/StatusBadge";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function AccountOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);
  const account = await getStoreAccount(store.businessId);
  if (!account) redirect(`${basePath}/account/login`);
  const root = `${basePath}/account`;

  const [stats, orders, wishlist, addrRes] = await Promise.all([
    customerOrderStats(store.businessId, account),
    listCustomerOrders(store.businessId, account),
    getServerWishlist(account.id),
    getAdminSupabase()
      .from("store_account_addresses")
      .select("label, name, address, area, city")
      .eq("account_id", account.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const latest = orders[0] ?? null;
  const defaultAddr = addrRes.data;

  const tiles = [
    { label: "Orders", value: stats.total, href: `${root}/orders`, icon: Package },
    { label: "In progress", value: stats.inProgress, href: `${root}/orders?filter=active`, icon: Package },
    { label: "Delivered", value: stats.delivered, href: `${root}/orders?filter=delivered`, icon: Package },
    { label: "Saved", value: wishlist.length, href: `${root}/wishlist`, icon: Heart },
  ];

  return (
    <div className="space-y-6">
      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-4 transition-colors hover:border-[var(--sf-accent)]"
          >
            <p className="text-2xl font-extrabold tracking-tight">{t.value}</p>
            <p className="mt-0.5 text-xs font-medium text-[var(--sf-muted)]">{t.label}</p>
          </Link>
        ))}
      </div>

      {/* latest order */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">Latest order</h2>
          {orders.length > 0 && (
            <Link href={`${root}/orders`} className="text-xs font-semibold text-[var(--sf-accent)]">
              All orders
            </Link>
          )}
        </div>
        {latest ? (
          <Link
            href={`${root}/orders/${latest.number}`}
            className="flex items-center gap-3 rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-3 transition-colors hover:border-[var(--sf-accent)]"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-card)]">
              {latest.thumb && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cldUrl(latest.thumb, 160)} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{latest.titleLine}</p>
              <p className="text-xs text-[var(--sf-muted)]">
                #{latest.number} · {fmtDate(latest.placedAt)} · {money(latest.total, latest.currency)}
              </p>
              <div className="mt-1.5">
                <StatusBadge status={latest.status} />
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--sf-muted)]" />
          </Link>
        ) : (
          <div className="rounded-[var(--sf-radius-lg)] border border-dashed border-[var(--sf-line)] p-6 text-center">
            <p className="text-sm text-[var(--sf-muted)]">You haven&apos;t placed an order yet.</p>
            <Link
              href={`${basePath}/products`}
              className="mt-3 inline-block rounded-full bg-[var(--sf-accent)] px-5 py-2 text-sm font-semibold text-white"
            >
              Start shopping
            </Link>
          </div>
        )}
      </section>

      {/* default address */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">Default address</h2>
          <Link href={`${root}/addresses`} className="text-xs font-semibold text-[var(--sf-accent)]">
            Manage
          </Link>
        </div>
        {defaultAddr ? (
          <div className="flex items-start gap-3 rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-3 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sf-muted)]" />
            <div>
              <p className="font-semibold">{defaultAddr.label || defaultAddr.name || "Address"}</p>
              <p className="text-[var(--sf-muted)]">
                {[defaultAddr.address, defaultAddr.area, defaultAddr.city].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>
        ) : (
          <Link
            href={`${root}/addresses`}
            className="flex items-center justify-between rounded-[var(--sf-radius-lg)] border border-dashed border-[var(--sf-line)] p-3 text-sm text-[var(--sf-muted)]"
          >
            Add a delivery address
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </section>

      {/* wishlist peek */}
      {wishlist.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">Saved items</h2>
            <Link href={`${root}/wishlist`} className="text-xs font-semibold text-[var(--sf-accent)]">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {wishlist.slice(0, 6).map((w) => (
              <Link
                key={w.productId}
                href={`${basePath}/products/${w.slug}`}
                className="aspect-square overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-card)]"
              >
                {w.image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={cldUrl(w.image, 200)} alt={w.name} className="h-full w-full object-cover" />
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
