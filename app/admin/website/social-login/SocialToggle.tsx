"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { saveWebsiteSettings } from "@/app/admin/website/actions";
import type { PlatformKey } from "@/lib/platform-settings";

export function SocialToggle({ settingKey, enabled, label }: { settingKey: PlatformKey; enabled: boolean; label: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const fd = new FormData();
      fd.set(settingKey, enabled ? "false" : "true");
      await saveWebsiteSettings(fd);
      toast(enabled ? `${label} hidden` : `${label} published`, "success");
      router.refresh();
    });

  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors" style={{ background: enabled ? "var(--primary)" : "var(--border)" }}>
        <input type="checkbox" checked={enabled} onChange={toggle} disabled={pending} className="peer sr-only" />
        <span
          className="inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: enabled ? "translateX(22px)" : "translateX(3px)" }}
        />
      </span>
      <span className="font-medium text-fg">{pending ? "Saving…" : enabled ? `${label} — visible on login/signup` : `${label} — hidden`}</span>
    </label>
  );
}
