"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { adminResolveStorefrontChatTopup } from "../tenants/[id]/actions";

interface Row {
  id: string;
  businessId: string;
  business: string;
  conversations: number;
  amount: number;
  method: string;
  txnId: string;
  at: string;
}

export function PendingTopups({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const resolve = (id: string, action: "grant" | "reject") =>
    start(async () => {
      const res = (await adminResolveStorefrontChatTopup(id, action)) as { error?: string };
      if (res?.error) return toast(res.error, "error");
      toast(action === "grant" ? "Granted" : "Rejected", "success");
      router.refresh();
    });

  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
          <span className="text-fg-muted">
            <Link href={`/admin/tenants/${r.businessId}`} className="font-medium text-primary">
              {r.business}
            </Link>{" "}
            · {r.conversations.toLocaleString("en-US")} conversations · ৳{r.amount} · {r.method} · txn{" "}
            <span className="font-mono text-xs">{r.txnId}</span> · {r.at}
          </span>
          <span className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => resolve(r.id, "grant")}>
              Grant
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => resolve(r.id, "reject")}>
              Reject
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
