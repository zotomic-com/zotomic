import { Boxes, Brain, Globe, MessageSquareText, PieChart, ShoppingCart, Target, Users } from "lucide-react";
import { cn } from "@/lib/cn";

function Connector() {
  return <div aria-hidden className="mx-auto h-6 w-px bg-border-strong" />;
}

function Node({
  icon: Icon,
  label,
  variant,
}: {
  icon: typeof Boxes;
  label: string;
  variant: "navy" | "primary-soft" | "primary";
}) {
  return (
    <div
      className={cn(
        "mx-auto inline-flex items-center gap-2.5 rounded-lg px-5 py-3 text-sm font-bold",
        variant === "navy" && "bg-navy text-white",
        variant === "primary-soft" && "bg-primary-soft text-primary",
        variant === "primary" && "bg-primary text-primary-fg",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function Card({ icon: Icon, label }: { icon: typeof Boxes; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-4 py-4 shadow-sm">
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-xs font-semibold text-fg">{label}</span>
    </div>
  );
}

export function FlowDiagram() {
  return (
    <div className="mx-auto w-full max-w-md text-center">
      <Node icon={Boxes} label="YOUR BUSINESS" variant="navy" />
      <Connector />
      <div className="grid grid-cols-3 gap-3">
        <Card icon={Globe} label="Website" />
        <Card icon={ShoppingCart} label="Orders" />
        <Card icon={Users} label="Customers" />
      </div>
      <Connector />
      <Node icon={Brain} label="ZOTOMIC INTELLIGENCE" variant="primary-soft" />
      <Connector />
      <div className="grid grid-cols-2 gap-3">
        <Card icon={PieChart} label="Reports" />
        <Card icon={MessageSquareText} label="Assistant" />
      </div>
      <Connector />
      <Node icon={Target} label="ACTION" variant="primary" />
    </div>
  );
}
