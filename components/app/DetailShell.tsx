import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Consistent detail-page layout: back link · header (title + status + actions)
 *  · 2-column body (main + sidebar). */
export function DetailShell({
  backHref,
  backLabel,
  title,
  meta,
  status,
  actions,
  children,
  sidebar,
}: {
  backHref: string;
  backLabel: string;
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-fg">{title}</h1>
            {status}
          </div>
          {meta && <p className="mt-1 text-sm text-fg-muted">{meta}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">{children}</div>
        {sidebar && <aside className="space-y-4">{sidebar}</aside>}
      </div>
    </div>
  );
}

export function FactList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {items.map((it, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-fg-subtle">{it.label}</dt>
          <dd className="text-right font-medium text-fg">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
