"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { adminAdjustCredits, confirmCreditPurchase, rejectCreditPurchase } from "./actions";

interface PurchaseRow {
  id: string;
  business: string;
  businessId: string;
  credits: number;
  amount: number;
  currency: string;
  method: string;
  txnId: string;
  status: string;
  note: string;
  submittedAt: string;
}
interface StoreRow {
  id: string;
  name: string;
  balance: number;
  purchased: number;
  lifetimeSpent: number;
}

export function CreditsAdminClient({ purchases, stores }: { purchases: PurchaseRow[]; stores: StoreRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const pendingRows = purchases.filter((p) => p.status === "submitted");
  const history = purchases.filter((p) => p.status !== "submitted").slice(0, 20);

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast(res.error, "error");
      else {
        toast("Done", "success");
        router.refresh();
      }
    });

  // manual adjust
  const [storeId, setStoreId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const selected = useMemo(() => stores.find((s) => s.id === storeId), [stores, storeId]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Top-ups to confirm</CardTitle>
          {pendingRows.length > 0 && <Badge tone="warning">{pendingRows.length}</Badge>}
        </CardHeader>
        <CardBody className="space-y-2">
          {pendingRows.length === 0 && <p className="text-sm text-fg-subtle">Nothing waiting.</p>}
          {pendingRows.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-sm border border-border p-3 text-sm">
              <div className="flex-1">
                <Link href={`/admin/tenants/${p.businessId}`} className="flex items-center gap-1 font-semibold text-fg hover:text-primary">
                  {p.business} <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />
                </Link>
                <p className="text-xs text-fg-muted">
                  {p.credits.toLocaleString("en-US")} credits · ৳{p.amount} · {p.method} · txn{" "}
                  <span className="font-mono">{p.txnId}</span> ·{" "}
                  {new Date(p.submittedAt).toLocaleString("en-US")}
                </p>
              </div>
              <Button size="sm" disabled={pending} onClick={() => run(() => confirmCreditPurchase(p.id))}>
                Grant {p.credits.toLocaleString("en-US")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const reason = window.prompt("Reason for rejecting this payment?") ?? "";
                  if (reason) run(() => rejectCreditPurchase(p.id, reason));
                }}
              >
                Reject
              </Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adjust a store&apos;s credits</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Store">
            <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Select a store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.balance} credits
                </option>
              ))}
            </Select>
          </Field>
          {selected && (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
              Balance {selected.balance} · bought {selected.purchased} · spent {selected.lifetimeSpent} lifetime
              <Link href={`/admin/tenants/${selected.id}`} className="font-semibold text-primary hover:underline">
                View credit history →
              </Link>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (+ add / − remove)">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 500 or -100"
              />
            </Field>
            <Field label="Note (shown to the owner)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Goodwill credit" />
            </Field>
          </div>
          <Button
            disabled={pending || !storeId || !amount}
            onClick={() =>
              run(async () => {
                const res = await adminAdjustCredits(storeId, Number(amount), note);
                if ("ok" in res) {
                  setAmount("");
                  setNote("");
                }
                return res;
              })
            }
          >
            Apply adjustment
          </Button>
        </CardBody>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent purchases</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5 text-sm">
            {history.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
                <span className="text-fg-muted">
                  <Link href={`/admin/tenants/${p.businessId}`} className="font-medium text-fg hover:text-primary">
                    {p.business}
                  </Link>{" "}
                  · {p.credits.toLocaleString("en-US")} credits · ৳{p.amount}
                </span>
                <Badge tone={p.status === "granted" ? "success" : "neutral"}>{p.status}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
