import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { tone: "success" | "info" | "neutral" | "warning" | "danger"; label: string }> = {
  delivered: { tone: "success", label: "Delivered" },
  shipped: { tone: "info", label: "Shipped" },
  processing: { tone: "info", label: "Processing" },
  confirmed: { tone: "neutral", label: "Confirmed" },
  pending: { tone: "warning", label: "Pending" },
  returned: { tone: "danger", label: "Returned" },
  cancelled: { tone: "danger", label: "Cancelled" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
