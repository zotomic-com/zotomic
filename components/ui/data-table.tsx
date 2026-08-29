import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./empty-state";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: { title: string; description?: string };
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  onRowClick,
}: Props<T>) {
  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="p-2">
        <EmptyState title={empty?.title ?? "Nothing here yet"} description={empty?.description} />
      </div>
    );
  }

  const alignCls = { left: "text-left", right: "text-right", center: "text-center" } as const;

  return (
    <div className="overflow-x-auto no-scrollbar">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
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
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border last:border-0",
                onRowClick && "cursor-pointer hover:bg-surface-2",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-4 py-3 text-fg-muted", alignCls[c.align ?? "left"], c.className)}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
