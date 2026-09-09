import { STATUS_META, type OrderStatus, type StatusTone } from "@/lib/storefront/order-status";

const TONE: Record<StatusTone, string> = {
  neutral: "bg-[var(--sf-card)] text-[var(--sf-muted)]",
  progress: "bg-[var(--sf-accent-soft)] text-[var(--sf-accent)]",
  success: "bg-emerald-500/12 text-emerald-600",
  danger: "bg-red-500/12 text-red-600",
};

export function StatusBadge({ status, className = "" }: { status: OrderStatus; className?: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[meta.tone]} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}
