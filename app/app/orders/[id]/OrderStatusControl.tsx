"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { setOrderStatus } from "../actions";

const STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "returned", "cancelled"];

export function OrderStatusControl({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const change = (next: string) =>
    start(async () => {
      const reason =
        next === "cancelled"
          ? window.prompt("Reason for cancelling this order? (optional — helps the assistant)") ?? ""
          : undefined;
      const res = await setOrderStatus(orderId, next, reason);
      if (res.error) toast(res.error, "error");
      else {
        toast(
          res.reviewInvites ? `Marked delivered · ${res.reviewInvites} review invite(s) created` : "Status updated",
          "success",
        );
        router.refresh();
      }
    });

  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      className="w-40 capitalize"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </Select>
  );
}
