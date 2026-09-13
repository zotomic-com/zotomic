"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { toggleAutoRenewAction, renewNowAction } from "./actions";

interface Item {
  id: string;
  domainName: string;
  status: string;
  expiresAt: string | null;
  autoRenew: boolean;
  lastError: string | null;
}

function daysLeft(expiresAt: string | null) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

export function DomainRow({ item, statusTone }: { item: Item; statusTone: "neutral" | "success" | "danger" | "warning" | "info" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const days = daysLeft(item.expiresAt);

  const toggleAutoRenew = (checked: boolean) =>
    start(async () => {
      const res = await toggleAutoRenewAction(item.id, checked);
      if ("error" in res) toast(res.error, "error");
      else router.refresh();
    });

  const renewNow = () =>
    start(async () => {
      const res = await renewNowAction(item.id);
      if ("error" in res) toast(res.error, "error");
      else {
        toast("Renewed", "success");
        router.refresh();
      }
    });

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-fg">{item.domainName}</p>
          <Badge tone={statusTone}>{item.status.replace("_", " ")}</Badge>
          {item.lastError && <p className="mt-1 max-w-md text-xs text-danger">{item.lastError}</p>}
        </div>
        <div className="flex items-center gap-4 text-sm">
          {days != null && (item.status === "active" || item.status === "grace") && (
            <span className={days <= 7 ? "text-danger" : "text-fg-muted"}>{days < 0 ? "expired" : `${days}d left`}</span>
          )}
          {(item.status === "active" || item.status === "grace") && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={item.autoRenew}
                  onChange={(e) => toggleAutoRenew(e.target.checked)}
                  disabled={pending}
                  className="h-3.5 w-3.5 accent-[var(--primary)]"
                />
                Auto-renew
              </label>
              <Button size="sm" variant="outline" disabled={pending} onClick={renewNow}>
                Renew now
              </Button>
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
