"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { submitPaymentAction } from "./actions";

export function PaymentForm({ reference, amount }: { reference: string; amount: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await submitPaymentAction(fd);
          if ("error" in res && res.error) toast(res.error, "error");
          else {
            toast("Payment submitted — we'll confirm it shortly", "success");
            router.refresh();
          }
        })
      }
      className="space-y-3"
    >
      <div className="rounded-sm border border-border bg-surface-2 p-3 text-sm">
        <p className="text-fg-muted">
          Send <span className="font-bold text-fg">৳{amount.toLocaleString("en-US")}</span> to our
          bKash, then enter the transaction ID below.
        </p>
        <p className="mt-1 text-xs text-fg-subtle">Reference: {reference}</p>
      </div>
      <Field label="bKash transaction ID">
        <Input name="txn_id" required placeholder="e.g. 8N7A6B5C4D" />
      </Field>
      <Field label="Amount paid (৳)">
        <Input name="amount" type="number" min="1" defaultValue={amount} required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "I've paid — submit for confirmation"}
      </Button>
    </form>
  );
}
