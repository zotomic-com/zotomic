import { Check, Clock, X } from "lucide-react";
import { orderTimeline, type OrderStatus } from "@/lib/storefront/order-status";

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-[var(--sf-radius)] bg-red-500/10 px-3 py-2.5 text-sm text-red-600">
        <X className="h-4 w-4 shrink-0" />
        This order was cancelled.
      </div>
    );
  }

  const steps = orderTimeline(status);

  return (
    <ol className="flex items-start">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : s.done || s.current ? "bg-[var(--sf-accent)]" : "bg-[var(--sf-line)]"}`} />
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                  s.done
                    ? "border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white"
                    : s.current
                      ? "border-[var(--sf-accent)] bg-[var(--sf-bg)] text-[var(--sf-accent)]"
                      : "border-[var(--sf-line)] bg-[var(--sf-bg)] text-[var(--sf-muted)]"
                }`}
              >
                {s.done ? <Check className="h-3.5 w-3.5" /> : s.current ? <Clock className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <span className={`h-0.5 flex-1 ${last ? "opacity-0" : s.done ? "bg-[var(--sf-accent)]" : "bg-[var(--sf-line)]"}`} />
            </div>
            <span className={`mt-1.5 text-[11px] font-medium ${s.done || s.current ? "text-[var(--sf-fg)]" : "text-[var(--sf-muted)]"}`}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
