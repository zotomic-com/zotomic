"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Phone, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { clearFraudHold } from "../actions";

function waLink(phone: string) {
  const d = phone.replace(/\D/g, "");
  const intl = d.startsWith("880") ? d : d.startsWith("0") ? `88${d}` : d;
  return `https://wa.me/${intl}`;
}

export function FraudHoldBanner({
  orderId,
  held,
  stageLabel,
  category,
  phone,
  email,
}: {
  orderId: string;
  held: boolean;
  stageLabel: string;
  category: string;
  phone: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const clear = () =>
    start(async () => {
      const res = await clearFraudHold(orderId);
      if ("error" in res) return toast(res.error, "error");
      toast("Hold cleared — you can proceed", "success");
      router.refresh();
    });

  return (
    <div className="rounded-lg border border-danger/40 bg-danger-soft p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-danger">
        <ShieldAlert className="h-4 w-4" />
        {held ? "Order on hold — fraud check" : `Fraud warning — ${stageLabel}`}
      </p>
      <p className="mt-1 text-sm text-fg-muted">
        This customer is on Zotomic&apos;s fraud watchlist ({stageLabel} · {category}).{" "}
        {held
          ? "The order can't be confirmed or shipped until you verify the customer and clear the hold."
          : "Verify the order directly before you confirm it."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {phone && (
          <>
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2"
            >
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
            <a
              href={waLink(phone)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          </>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2"
          >
            <Mail className="h-3.5 w-3.5" /> Email
          </a>
        )}
        {held && (
          <Button size="sm" variant="danger" disabled={pending} onClick={clear}>
            {pending ? "Clearing…" : "Verified — clear hold & proceed"}
          </Button>
        )}
      </div>
    </div>
  );
}
