"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, XCircle, PackageX } from "lucide-react";
import { BottomSheet } from "@/components/storefront/BottomSheet";
import { addToCart } from "@/components/storefront/cart-store";
import { cancelOrderAction, reorderAction, requestReturnAction } from "../actions";

const RETURN_REASONS = [
  "Wrong item delivered",
  "Item damaged or defective",
  "Not as described",
  "Changed my mind",
  "Size / fit issue",
  "Other",
];

export function OrderDetailActions({
  slug,
  basePath,
  orderNumber,
  canCancel,
  canReturn,
  returnWindowDays,
}: {
  slug: string;
  basePath: string;
  orderNumber: string;
  canCancel: boolean;
  canReturn: boolean;
  returnWindowDays: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<null | "cancel" | "return">(null);
  const [cancelReason, setCancelReason] = useState("");
  const [retReason, setRetReason] = useState(RETURN_REASONS[0]);
  const [retNote, setRetNote] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string; cart?: boolean } | null>(null);

  const doReorder = () =>
    start(async () => {
      setMsg(null);
      const res = await reorderAction(slug, orderNumber);
      if ("error" in res) {
        setMsg({ tone: "err", text: res.error });
        return;
      }
      for (const it of res.items) {
        addToCart(
          slug,
          {
            id: it.id,
            productId: it.productId,
            variantId: it.variantId,
            variantLabel: it.variantLabel,
            name: it.name,
            price: it.price,
            image: it.image,
            slug: it.slug,
          },
          it.qty,
        );
      }
      if (res.issues.length) {
        // some lines couldn't be re-added — let the shopper see why before leaving
        setMsg({ tone: "err", text: `Added what's available. ${res.issues.join(". ")}.`, cart: true });
        return;
      }
      router.push(`${basePath}/cart`);
    });

  const doCancel = () =>
    start(async () => {
      setMsg(null);
      const res = await cancelOrderAction(slug, orderNumber, cancelReason);
      if ("error" in res) {
        setMsg({ tone: "err", text: res.error });
        setSheet(null);
        return;
      }
      setSheet(null);
      setMsg({ tone: "ok", text: "Your order has been cancelled." });
      router.refresh();
    });

  const doReturn = () =>
    start(async () => {
      setMsg(null);
      const res = await requestReturnAction(slug, orderNumber, retReason, retNote);
      if ("error" in res) {
        setMsg({ tone: "err", text: res.error });
        setSheet(null);
        return;
      }
      setSheet(null);
      setMsg({ tone: "ok", text: `Return ${res.returnNumber} requested. The store will contact you.` });
      router.refresh();
    });

  const btn =
    "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60";

  return (
    <div className="space-y-2.5">
      {msg && (
        <p className={`text-sm ${msg.tone === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
          {msg.cart && (
            <>
              {" "}
              <a href={`${basePath}/cart`} className="font-semibold underline">
                View cart
              </a>
            </>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={doReorder} disabled={pending} className={`${btn} bg-[var(--sf-accent)] text-white`}>
          <RotateCcw className="h-4 w-4" /> Reorder
        </button>
        {canReturn && (
          <button
            onClick={() => setSheet("return")}
            disabled={pending}
            className={`${btn} border border-[var(--sf-line)]`}
          >
            <PackageX className="h-4 w-4" /> Request a return
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => setSheet("cancel")}
            disabled={pending}
            className={`${btn} border border-[var(--sf-line)] text-red-600`}
          >
            <XCircle className="h-4 w-4" /> Cancel order
          </button>
        )}
      </div>

      <BottomSheet open={sheet === "cancel"} onClose={() => setSheet(null)} title="Cancel this order?">
        <p className="mb-3 text-sm text-[var(--sf-muted)]">
          Tell the store why (optional). Cancelling puts the items back in stock.
        </p>
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={3}
          placeholder="Reason for cancelling…"
          className="w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 py-2 text-sm"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={doCancel}
            disabled={pending}
            className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Cancelling…" : "Yes, cancel it"}
          </button>
          <button
            onClick={() => setSheet(null)}
            className="rounded-full border border-[var(--sf-line)] px-4 py-2.5 text-sm font-semibold"
          >
            Keep it
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "return"} onClose={() => setSheet(null)} title="Request a return">
        <p className="mb-3 text-sm text-[var(--sf-muted)]">
          Within {returnWindowDays} days of delivery. The store reviews every request.
        </p>
        <label className="mb-1 block text-xs font-semibold text-[var(--sf-muted)]">Reason</label>
        <select
          value={retReason}
          onChange={(e) => setRetReason(e.target.value)}
          className="mb-3 w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 py-2 text-sm"
        >
          {RETURN_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <textarea
          value={retNote}
          onChange={(e) => setRetNote(e.target.value)}
          rows={3}
          placeholder="Anything else the store should know…"
          className="w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 py-2 text-sm"
        />
        <button
          onClick={doReturn}
          disabled={pending}
          className="mt-3 w-full rounded-full bg-[var(--sf-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit request"}
        </button>
      </BottomSheet>
    </div>
  );
}
