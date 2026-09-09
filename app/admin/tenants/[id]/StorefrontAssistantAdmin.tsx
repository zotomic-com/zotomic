"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  adminSetStorefrontAssistantSuspended,
  adminGrantStorefrontConversations,
  adminResolveStorefrontChatTopup,
} from "./actions";

interface Topup {
  id: string;
  conversations: number;
  amount: number;
  method: string;
  txnId: string;
  at: string;
}

export function StorefrontAssistantAdmin({
  businessId,
  enabled,
  suspended,
  suspendedReason,
  extra,
  quota,
  used,
  messages,
  blocked,
  topups,
}: {
  businessId: string;
  enabled: boolean;
  suspended: boolean;
  suspendedReason: string;
  extra: number;
  quota: number;
  used: number;
  messages: number;
  blocked: number;
  topups: Topup[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState(suspendedReason);
  const [grant, setGrant] = useState("");

  const run = (fn: () => Promise<{ error?: string } | { ok?: boolean }>, ok = "Done", after?: () => void) =>
    start(async () => {
      const res = (await fn()) as { error?: string };
      if (res && res.error) return toast(res.error, "error");
      toast(ok, "success");
      after?.();
      router.refresh();
    });

  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Storefront assistant
          </span>
        </CardTitle>
        <span className="flex items-center gap-2">
          {suspended ? (
            <Badge tone="danger">Suspended</Badge>
          ) : enabled ? (
            <Badge tone="success">On</Badge>
          ) : (
            <Badge tone="neutral">Off by owner</Badge>
          )}
        </span>
      </CardHeader>

      <div className="space-y-4 px-4 py-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-fg-muted">
          <span>
            This month: <span className="font-semibold text-fg">{fmt(used)}</span> / {fmt(quota)} conversations
          </span>
          <span>Top-up pool: <span className="font-semibold text-fg">{fmt(extra)}</span></span>
          <span>{fmt(messages)} messages</span>
          {blocked > 0 && <span className="text-danger">{fmt(blocked)} blocked</span>}
        </div>

        {/* Suspend */}
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 font-medium text-fg">{suspended ? "Suspended" : "Suspend assistant"}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason shown to the owner (e.g. abuse, non-payment)"
            />
            {suspended ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => adminSetStorefrontAssistantSuspended(businessId, false, ""), "Un-suspended")}
              >
                Un-suspend
              </Button>
            ) : (
              <Button
                variant="danger"
                size="sm"
                disabled={pending || reason.trim().length < 3}
                onClick={() => run(() => adminSetStorefrontAssistantSuspended(businessId, true, reason), "Suspended")}
              >
                Suspend
              </Button>
            )}
          </div>
        </div>

        {/* Grant conversations */}
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 font-medium text-fg">Adjust top-up pool</p>
          <div className="flex gap-2">
            <Input
              type="number"
              value={grant}
              onChange={(e) => setGrant(e.target.value)}
              placeholder="e.g. 1000 or -200"
              className="max-w-[160px]"
            />
            <Button
              size="sm"
              disabled={pending || !grant}
              onClick={() =>
                run(() => adminGrantStorefrontConversations(businessId, Number(grant)), "Pool updated", () => setGrant(""))
              }
            >
              Apply
            </Button>
          </div>
        </div>

        {/* Pending top-ups */}
        {topups.length > 0 && (
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 font-medium text-fg">Pending top-up payments</p>
            <ul className="space-y-2">
              {topups.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-fg-muted">
                    {fmt(t.conversations)} conversations · ৳{t.amount} · {t.method} · txn{" "}
                    <span className="font-mono text-xs">{t.txnId}</span> · {t.at}
                  </span>
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => adminResolveStorefrontChatTopup(t.id, "grant"), "Granted")}
                    >
                      Grant
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => adminResolveStorefrontChatTopup(t.id, "reject"), "Rejected")}
                    >
                      Reject
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
