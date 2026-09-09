"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export interface GridColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  columns: GridColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** navigate on row click */
  rowHref?: (row: T) => string;
  /** selection */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  loading?: boolean;
  empty?: { title: string; description?: string };
}

const alignCls = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  selected,
  onSelectedChange,
  loading,
  empty,
}: Props<T>) {
  const router = useRouter();
  const selectable = !!(selected && onSelectedChange);

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="p-3">
        <EmptyState title={empty?.title ?? "Nothing here yet"} description={empty?.description} />
      </div>
    );
  }

  const allKeys = rows.map(rowKey);
  const allChecked = selectable && allKeys.every((k) => selected!.has(k));
  const someChecked = selectable && !allChecked && allKeys.some((k) => selected!.has(k));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) allKeys.forEach((k) => next.delete(k));
    else allKeys.forEach((k) => next.add(k));
    onSelectedChange!(next);
  };
  const toggleOne = (k: string) => {
    const next = new Set(selected);
    next.has(k) ? next.delete(k) : next.add(k);
    onSelectedChange!(next);
  };

  return (
    <div className="overflow-x-auto no-scrollbar">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border">
            {selectable && (
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle",
                  alignCls[c.align ?? "left"],
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const k = rowKey(row);
            const href = rowHref?.(row);
            return (
              <tr
                key={k}
                onClick={
                  href
                    ? (e) => {
                        if ((e.target as HTMLElement).closest("a,button,input,label")) return;
                        router.push(href);
                      }
                    : undefined
                }
                className={cn(
                  "border-b border-border last:border-0 transition-colors",
                  href && "cursor-pointer hover:bg-surface-2",
                  selected?.has(k) && "bg-primary-soft/40",
                )}
              >
                {selectable && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={selected!.has(k)}
                      onChange={() => toggleOne(k)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-4 py-3 text-fg-muted", alignCls[c.align ?? "left"], c.className)}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
