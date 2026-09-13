"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { saveWebsiteSettings } from "@/app/admin/website/actions";

export function SandboxToggle({ sandbox }: { sandbox: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("dynadot_use_sandbox", sandbox ? "false" : "true");
      await saveWebsiteSettings(fd);
      toast(sandbox ? "Switched to live Dynadot" : "Switched to Dynadot sandbox", "success");
      router.refresh();
    });

  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors" style={{ background: sandbox ? "var(--warning)" : "var(--border)" }}>
        <input type="checkbox" checked={sandbox} onChange={toggle} disabled={pending} className="peer sr-only" />
        <span
          className="inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: sandbox ? "translateX(22px)" : "translateX(3px)" }}
        />
      </span>
      <span className="font-medium text-fg">
        {pending ? "Saving…" : sandbox ? "Sandbox mode — test only, no real charges" : "Live mode — real charges apply"}
      </span>
    </label>
  );
}
