/** Order status metadata shared by storefront customer views (client-safe). */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

/** The happy-path delivery pipeline, in order. */
export const ORDER_STEPS: { key: OrderStatus; label: string }[] = [
  { key: "pending", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Packing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

export type StatusTone = "neutral" | "progress" | "success" | "danger";

export const STATUS_META: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "Order placed", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "progress" },
  processing: { label: "Being packed", tone: "progress" },
  shipped: { label: "On the way", tone: "progress" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  returned: { label: "Returned", tone: "danger" },
};

export interface TimelineStep {
  key: OrderStatus;
  label: string;
  done: boolean;
  current: boolean;
}

/** Build the 5-step tracker for a given status. Terminal states (cancelled /
 *  returned) mark progress up to where the order got before it stopped. */
export function orderTimeline(status: OrderStatus): TimelineStep[] {
  const order = ORDER_STEPS.map((s) => s.key);
  let reachedIdx = order.indexOf(status);
  if (status === "cancelled" || status === "returned") {
    // keep whatever milestones make sense; cancelled from pending shows only step 1
    reachedIdx = status === "returned" ? order.indexOf("delivered") : 0;
  }
  return ORDER_STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    done: i < reachedIdx || (i === reachedIdx && status === "delivered"),
    current: i === reachedIdx && status !== "delivered",
  }));
}

/** Can the shopper still cancel this order themselves? */
export function canCancel(status: OrderStatus): boolean {
  return status === "pending" || status === "confirmed";
}

/** Return window in days after delivery. */
export const RETURN_WINDOW_DAYS = 7;

export function withinReturnWindow(deliveredAt: string | null): boolean {
  if (!deliveredAt) return false;
  const delivered = new Date(deliveredAt).getTime();
  return Date.now() - delivered <= RETURN_WINDOW_DAYS * 86_400_000;
}

/** A cart line rebuilt from a past order (see reorderAction). */
export interface ReorderItem {
  id: string;
  productId: string;
  variantId?: string;
  variantLabel?: string;
  name: string;
  price: number;
  image: string | null;
  slug: string;
  qty: number;
}
