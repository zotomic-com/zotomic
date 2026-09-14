"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { updateServiceInquiryStatusAction } from "./actions";

export function ServiceInquiryActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const setStatus = (next: "contacted" | "closed") =>
    start(async () => {
      const res = await updateServiceInquiryStatusAction(id, next);
      if ("error" in res) return toast(res.error, "error");
      toast(next === "contacted" ? "Marked contacted" : "Marked closed", "success");
      router.refresh();
    });

  return (
    <div className="flex justify-end gap-2">
      {status !== "contacted" && (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus("contacted")}>
          Mark contacted
        </Button>
      )}
      {status !== "closed" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus("closed")}>
          Mark closed
        </Button>
      )}
    </div>
  );
}
