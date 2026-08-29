import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "./card";

interface Props {
  label: string;
  value: string;
  /** signed percentage change, e.g. +12 or -8. Omit when not available. */
  delta?: number | null;
  deltaLabel?: string;
  /** true when a positive delta is bad (e.g. Returns, Refunds) */
  invert?: boolean;
  /** shown when there is genuinely no value to display */
  unavailableReason?: string;
}

export function StatCard({
  label,
  value,
  delta,
  deltaLabel = "vs last period",
  invert = false,
  unavailableReason,
}: Props) {
  const hasDelta = typeof delta === "number" && !Number.isNaN(delta);
  const good = hasDelta ? (invert ? delta! < 0 : delta! > 0) : false;
  const Arrow = hasDelta && delta! < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
      {unavailableReason ? (
        <>
          <p className="mt-2 text-lg font-bold text-fg-subtle">Not available</p>
          <p className="mt-1 text-xs text-fg-subtle">{unavailableReason}</p>
        </>
      ) : (
        <>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-fg">{value}</p>
          {hasDelta && (
            <p
              className={cn(
                "mt-1 flex items-center gap-1 text-xs font-semibold",
                good ? "text-success" : "text-danger",
              )}
            >
              <Arrow className="h-3.5 w-3.5" />
              {Math.abs(delta!)}% <span className="font-normal text-fg-subtle">{deltaLabel}</span>
            </p>
          )}
        </>
      )}
    </Card>
  );
}
