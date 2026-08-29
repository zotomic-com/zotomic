import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Button } from "./button";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  /** distinguishes "nothing here yet" from "something is wrong" */
  tone?: "empty" | "error";
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, tone = "empty" }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-dashed border-border-strong px-6 py-12 text-center">
      <div
        className={
          tone === "error"
            ? "mb-3 rounded-full bg-danger-soft p-3 text-danger"
            : "mb-3 rounded-full bg-surface-2 p-3 text-fg-subtle"
        }
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && (
        <Button
          size="sm"
          className="mt-4"
          href={action.href}
          onClick={action.onClick}
          variant={tone === "error" ? "outline" : "primary"}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
