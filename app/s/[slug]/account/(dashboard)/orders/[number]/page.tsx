import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, MapPin, Truck } from "lucide-react";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { money } from "@/lib/money";
import { cldUrl } from "@/lib/cloudinary";
import { getCustomerOrder } from "@/lib/storefront/customer-orders";
import {
  canCancel,
  withinReturnWindow,
  RETURN_WINDOW_DAYS,
} from "@/lib/storefront/order-status";
import { OrderTimeline } from "../../../_components/OrderTimeline";
import { StatusBadge } from "../../../_components/StatusBadge";
import { OrderDetailActions } from "../../../_components/OrderDetailActions";

export const metadata: Metadata = { title: "Order", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);
  const account = await getStoreAccount(store.businessId);
  if (!account) redirect(`${basePath}/account/login`);

  const order = await getCustomerOrder(store.businessId, account, number);
  if (!order) notFound();

  const cur = order.currency;
  const returnable =
    order.status === "delivered" && withinReturnWindow(order.deliveredAt) && !order.activeReturn;

  return (
    <div className="space-y-6">
      <Link
        href={`${basePath}/account/orders`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--sf-muted)] hover:text-[var(--sf-fg)]"
      >
        <ArrowLeft className="h-4 w-4" /> All orders
      </Link>

      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Order #{order.number}</h1>
          <p className="text-sm text-[var(--sf-muted)]">Placed {fmtDate(order.placedAt)}</p>
        </div>
        <StatusBadge status={order.status} className="mt-1" />
      </div>

      {/* timeline */}
      <div className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-4">
        <OrderTimeline status={order.status} />
        {order.status === "cancelled" && order.cancelReason && (
          <p className="mt-3 text-center text-xs text-[var(--sf-muted)]">{order.cancelReason}</p>
        )}
      </div>

      {/* tracking */}
      {order.shipment && (
        <div className="flex items-start gap-3 rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-4 text-sm">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sf-accent)]" />
          <div>
            <p className="font-semibold capitalize">
              {order.shipment.status.replace(/_/g, " ")} · {order.shipment.provider}
            </p>
            {order.shipment.trackingCode && (
              <p className="text-[var(--sf-muted)]">
                Tracking code: <span className="font-mono text-[var(--sf-fg)]">{order.shipment.trackingCode}</span>
              </p>
            )}
            {!order.shipment.trackingCode && order.shipment.consignmentId && (
              <p className="text-[var(--sf-muted)]">
                Consignment: <span className="font-mono text-[var(--sf-fg)]">{order.shipment.consignmentId}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* active return notice */}
      {order.activeReturn && (
        <div className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-accent-soft)] p-4 text-sm">
          <p className="font-semibold text-[var(--sf-accent)]">
            Return {order.activeReturn.number} · {order.activeReturn.status}
          </p>
          <p className="text-[var(--sf-muted)]">
            Requested {fmtDate(order.activeReturn.createdAt)}. The store will be in touch.
          </p>
        </div>
      )}

      {/* items */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">Items</h2>
        <ul className="divide-y divide-[var(--sf-line)] rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)]">
          {order.items.map((it, i) => (
            <li key={i} className="flex gap-3 p-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-card)]">
                {it.image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={cldUrl(it.image, 160)} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {it.productSlug ? (
                  <Link href={`${basePath}/products/${it.productSlug}`} className="text-sm font-medium hover:underline">
                    {it.name}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">{it.name}</p>
                )}
                <p className="text-xs text-[var(--sf-muted)]">
                  {money(it.unitPrice, cur)} × {it.qty}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold">{money(it.lineTotal, cur)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* review invites */}
      {order.reviewable.length > 0 && (
        <section className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-4">
          <p className="text-sm font-semibold">How was it?</p>
          <p className="mb-2.5 text-xs text-[var(--sf-muted)]">Leave a review to help other shoppers.</p>
          <div className="flex flex-wrap gap-2">
            {order.reviewable.map((r) =>
              r.token ? (
                <Link
                  key={r.productId}
                  href={`${basePath}/review/${r.token}`}
                  className="rounded-full border border-[var(--sf-line)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--sf-accent)]"
                >
                  Review {r.name}
                </Link>
              ) : null,
            )}
          </div>
        </section>
      )}

      {/* address + payment */}
      <div className="grid gap-3 sm:grid-cols-2">
        {order.address && (
          <div className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-4 text-sm">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <MapPin className="h-4 w-4 text-[var(--sf-muted)]" /> Delivery
            </p>
            <p className="text-[var(--sf-muted)]">
              {[order.address.line, order.address.city].filter(Boolean).join(", ")}
            </p>
            {order.address.note && <p className="mt-1 text-xs text-[var(--sf-muted)]">Note: {order.address.note}</p>}
          </div>
        )}
        <div className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-4 text-sm">
          <p className="mb-1 font-semibold">Payment</p>
          <p className="capitalize text-[var(--sf-muted)]">
            {order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod} · {order.paymentStatus}
          </p>
        </div>
      </div>

      {/* totals */}
      <div className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-4 text-sm">
        <div className="flex justify-between py-0.5">
          <span className="text-[var(--sf-muted)]">Subtotal</span>
          <span>{money(order.subtotal, cur)}</span>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between py-0.5">
            <span className="text-[var(--sf-muted)]">Discount</span>
            <span>−{money(order.discount, cur)}</span>
          </div>
        )}
        <div className="flex justify-between py-0.5">
          <span className="text-[var(--sf-muted)]">Shipping</span>
          <span>{order.shipping === 0 ? "Free" : money(order.shipping, cur)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-[var(--sf-line)] pt-2 text-base font-bold">
          <span>Total</span>
          <span>{money(order.total, cur)}</span>
        </div>
      </div>

      {/* actions */}
      <OrderDetailActions
        slug={slug}
        basePath={basePath}
        orderNumber={order.number}
        canCancel={canCancel(order.status)}
        canReturn={returnable}
        returnWindowDays={RETURN_WINDOW_DAYS}
      />

      <a
        href={`${basePath}/order/${order.number}/invoice`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--sf-muted)] hover:text-[var(--sf-fg)]"
      >
        <Download className="h-4 w-4" /> Download invoice (PDF)
      </a>
    </div>
  );
}
