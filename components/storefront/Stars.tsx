import { Star } from "lucide-react";

/**
 * Star rating readout. Default = five stars filled to the average + the average +
 * an optional review count, e.g. ★★★★★ 4.5 (120). `single` = one star + the
 * number only, e.g. ★ 4.5 (used in tight mobile spots).
 */
export function Stars({
  value,
  count,
  single = false,
  className = "",
  starClass = "h-3.5 w-3.5",
}: {
  value: number;
  count?: number;
  single?: boolean;
  className?: string;
  starClass?: string;
}) {
  if (single) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <Star className={`${starClass} fill-amber-400 text-amber-400`} />
        <span className="font-semibold tabular-nums">{value.toFixed(1)}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`${starClass} text-amber-400`}
            fill={value >= n - 0.25 ? "currentColor" : "none"}
          />
        ))}
      </span>
      <span className="font-semibold tabular-nums">{value.toFixed(1)}</span>
      {count != null && <span className="text-[var(--sf-muted)] tabular-nums">({count})</span>}
    </span>
  );
}
