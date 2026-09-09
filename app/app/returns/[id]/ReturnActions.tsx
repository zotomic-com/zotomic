"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setReturnStatus } from "../actions";

const NEXT: Record<string, { label: string; to: string; danger?: boolean }[]> = {
  requested: [
    { label: "Approve", to: "approved" },
    { label: "Reject", to: "rejected", danger: true },
  ],
  approved: [{ label: "Mark received", to: "received" }],
  received: [{ label: "Mark refunded", to: "refunded" }],
};

export function ReturnActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const move = (to: string) =>
    start(async () => {
      const res = await setReturnStatus(id, to as never);
      if ("error" in res) return toast(res.error, "error");
      toast(`Marked ${to}`, "success");
      router.refresh();
    });

  const opts = NEXT[status] ?? [];
  if (!opts.length) return <span className="text-sm text-fg-subtle">No further action.</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Button
          key={o.to}
          size="sm"
          variant="outline"
          disabled={pending}
          className={o.danger ? "text-danger" : undefined}
          onClick={() => move(o.to)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
