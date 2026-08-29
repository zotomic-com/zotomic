"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { retryReport } from "./actions";

export function RetryButton({ businessId }: { businessId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await retryReport(businessId);
          if ("error" in res && res.error) toast(res.error, "error");
          else {
            toast("Report regenerated", "success");
            router.refresh();
          }
        })
      }
      className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs font-medium hover:bg-surface-2"
    >
      <RefreshCw className={pending ? "h-3 w-3 animate-spin" : "h-3 w-3"} /> Retry
    </button>
  );
}
