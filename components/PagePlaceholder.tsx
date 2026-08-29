import { Construction } from "lucide-react";

/** Temporary scaffold for routes that land in a later build phase. */
export function PagePlaceholder({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description?: string;
}) {
  return (
    <div>
      <h1 className="text-xl font-extrabold text-fg">{title}</h1>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className="mt-6 flex flex-col items-center justify-center rounded border border-dashed border-border-strong px-6 py-16 text-center">
        <div className="mb-3 rounded-full bg-surface-2 p-3 text-fg-subtle">
          <Construction className="h-5 w-5" />
        </div>
        <p className="text-sm font-bold text-fg">Coming in {phase}</p>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">
          This screen is scaffolded. Its full build is scheduled for {phase} of the rebuild.
        </p>
      </div>
    </div>
  );
}
