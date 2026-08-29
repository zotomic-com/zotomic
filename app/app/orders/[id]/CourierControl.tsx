"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { bookCourier } from "../actions";

interface Shipment {
  provider: string;
  status: string;
  trackingCode: string | null;
  consignmentId: string | null;
}

export function CourierControl({
  orderId,
  couriers,
  shipment,
}: {
  orderId: string;
  couriers: { id: string; name: string }[];
  shipment: Shipment | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [provider, setProvider] = useState(couriers[0]?.id ?? "");

  if (shipment) {
    return (
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <span className="font-medium text-fg capitalize">{shipment.provider}</span>
          <Badge tone={shipment.status === "delivered" ? "success" : "info"}>{shipment.status}</Badge>
        </div>
        {(shipment.trackingCode || shipment.consignmentId) && (
          <p className="text-fg-muted">
            Tracking: <span className="font-mono">{shipment.trackingCode ?? shipment.consignmentId}</span>
          </p>
        )}
      </div>
    );
  }

  if (couriers.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        No courier connected.{" "}
        <a href="/app/integrations" className="font-semibold text-primary">
          Connect one
        </a>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-36 capitalize">
        {couriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await bookCourier(orderId, provider);
            if ("error" in res && res.error) toast(res.error, "error");
            else {
              toast(`Booked — ${res.tracking ?? "done"}`, "success");
              router.refresh();
            }
          })
        }
      >
        <Truck className="h-4 w-4" /> Book courier
      </Button>
    </div>
  );
}
