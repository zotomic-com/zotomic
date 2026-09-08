import Link from "next/link";
import { Coins } from "lucide-react";
import { getCreditAccount } from "@/lib/credits";

/**
 * Assistant-credit meter for the dashboard and the assistant page.
 * Server component — reads the live balance.
 */
export async function CreditMeter({ businessId, compact = false }: { businessId: string; compact?: boolean }) {
  let acc;
  try {
    acc = await getCreditAccount(businessId);
  } catch {
    return null;
  }

  const resetsOn = new Date(acc.weekResetsOn + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const low = acc.spendable <= Math.max(5, Math.round(acc.planAllowance * 0.15));
  const pct = acc.planAllowance > 0 ? Math.max(0, Math.min(100, (acc.allowanceBalance / acc.planAllowance) * 100)) : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <Coins className={`h-3.5 w-3.5 ${low ? "text-warning" : "text-primary"}`} />
        <span className={low ? "font-semibold text-warning" : "font-medium text-fg"}>
          {acc.spendable} credit{acc.spendable === 1 ? "" : "s"}
        </span>
        {acc.spendable <= 0 && (
          <Link href="/app/billing#credits" className="font-semibold text-primary hover:underline">
            Top up
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Coins className={`h-4 w-4 ${low ? "text-warning" : "text-primary"}`} />
          Assistant credits
        </div>
        <Link href="/app/billing#credits" className="text-xs font-semibold text-primary hover:underline">
          Buy credits
        </Link>
      </div>
      <p className="mt-2 text-2xl font-extrabold text-fg">{acc.spendable}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${low ? "bg-warning" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-fg-subtle">
        {acc.allowanceBalance < 0
          ? `${-acc.allowanceBalance} in overdraft — repaid from your next allowance.`
          : `${acc.allowanceBalance} of ${acc.planAllowance} weekly`}
        {acc.purchasedBalance > 0 ? ` · ${acc.purchasedBalance} bought` : ""} · resets {resetsOn}
      </p>
    </div>
  );
}
