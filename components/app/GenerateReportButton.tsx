"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function GenerateReportButton({ label = "Generate this week's report" }: { label?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/app/reports/generate", { method: "POST" });
      const d = await res.json();
      if (res.ok && d.status === "ready") {
        toast(d.aiModel ? "Report generated with AI narrative" : "Report generated", "success");
        router.refresh();
      } else {
        toast("Report generation failed", "error");
      }
    } catch {
      toast("Report generation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={run} disabled={busy} variant="outline" size="sm">
      <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      {busy ? "Generating…" : label}
    </Button>
  );
}
