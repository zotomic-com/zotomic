"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Coins } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { CREDIT_PACKS } from "@/lib/credits";
import { submitCreditPurchase } from "./credit-actions";

export function CreditsCard({
  balance,
  resetsOn,
  weeklyAllowance,
  purchased,
  payment,
}: {
  balance: number;
  resetsOn: string;
  weeklyAllowance: number;
  purchased: number;
  payment: { bkash: string; nagad: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [packId, setPackId] = useState<string | null>(null);
  const [method, setMethod] = useState<"bkash" | "nagad">(payment.bkash ? "bkash" : "nagad");

  const pack = CREDIT_PACKS.find((p) => p.id === packId) ?? null;
  const number = method === "bkash" ? payment.bkash : payment.nagad;
  const resetLabel = new Date(resetsOn + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <Card id="credits">
      <CardHeader>
        <CardTitle>Assistant credits</CardTitle>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <Coins className="h-4 w-4 text-primary" /> {balance}
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-fg-muted">
          {balance < 0
            ? `${-balance} credits in overdraft — repaid from your next allowance.`
            : `${balance} credits available`}
          . Your plan adds {weeklyAllowance} every week (resets {resetLabel}).
          {purchased > 0 ? ` ${purchased} of these are bought credits and don't expire.` : ""}
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {CREDIT_PACKS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPackId(p.id)}
              className={`rounded-sm border p-3 text-left ${
                packId === p.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-border-strong"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-fg">{p.credits.toLocaleString("en-US")} credits</span>
                {packId === p.id && <Check className="h-4 w-4 text-primary" />}
              </div>
              <p className="text-xs text-fg-muted">
                ৳{p.price.toLocaleString("en-US")}
                {p.tag ? <span className="ml-1 font-semibold text-primary">· {p.tag}</span> : null}
              </p>
            </button>
          ))}
        </div>

        {pack && (
          <form
            action={(fd) =>
              start(async () => {
                fd.set("pack", pack.id);
                fd.set("method", method);
                const res = await submitCreditPurchase(fd);
                if ("error" in res) toast(res.error, "error");
                else {
                  toast("Payment submitted — credits are added once we confirm it.", "success");
                  setPackId(null);
                  router.refresh();
                }
              })
            }
            className="space-y-3 rounded-sm border border-border bg-surface-2 p-3"
          >
            <div className="flex gap-2">
              {(["bkash", "nagad"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  disabled={!payment[m]}
                  className={`flex-1 rounded-sm border px-3 py-1.5 text-sm font-semibold capitalize disabled:opacity-40 ${
                    method === m ? "border-primary bg-primary-soft text-primary" : "border-border text-fg-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {number ? (
              <p className="text-sm text-fg-muted">
                Send <span className="font-bold text-fg">৳{pack.price.toLocaleString("en-US")}</span> to{" "}
                <span className="font-bold text-fg">{number}</span> ({method}), then enter the transaction ID.
              </p>
            ) : (
              <p className="text-sm text-warning">
                No {method} number is set up yet — contact support to buy credits.
              </p>
            )}

            <Field label={`${method === "bkash" ? "bKash" : "Nagad"} transaction ID`}>
              <Input name="txn_id" required placeholder="e.g. 8N7A6B5C4D" />
            </Field>

            <Button type="submit" disabled={pending || !number} className="w-full">
              {pending ? "Submitting…" : `I've paid ৳${pack.price} — submit`}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
