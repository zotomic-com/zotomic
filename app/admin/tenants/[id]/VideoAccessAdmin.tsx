"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Video } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { adminSetFeature, adminSetVideoCap, adminWipeStoreVideos } from "./actions";
import type { VideoAccess } from "@/lib/storefront/videos";

export function VideoAccessAdmin({ businessId, access }: { businessId: string; access: VideoAccess }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [cap, setCap] = useState(String(access.cap));

  const run = (fn: () => Promise<{ error?: string } | { ok?: boolean; count?: number }>, ok = "Done") =>
    start(async () => {
      const res = (await fn()) as { error?: string; count?: number };
      if (res?.error) return toast(res.error, "error");
      toast(typeof res?.count === "number" ? `Deleted ${res.count} video(s)` : ok, "success");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Video className="h-4 w-4 text-danger" /> Video gallery
          </span>
        </CardTitle>
        <span className="flex items-center gap-2">
          {access.featureOn ? <Badge tone="success">On</Badge> : <Badge tone="danger">Blocked</Badge>}
        </span>
      </CardHeader>

      <div className="space-y-4 px-4 py-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-fg-muted">
          <span>
            Used: <span className="font-semibold text-fg">{access.used}</span> / {access.cap}
            {access.capIsOverride && <span className="text-fg-subtle"> (custom limit)</span>}
          </span>
          <span className="capitalize">{access.plan} plan</span>
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 font-medium text-fg">{access.featureOn ? "Suspend / block access" : "Access blocked"}</p>
          <div className="flex flex-wrap gap-2">
            {access.featureOn ? (
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => run(() => adminSetFeature(businessId, "video_gallery", false), "Blocked")}
              >
                Suspend / block
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => adminSetFeature(businessId, "video_gallery", true), "Restored")}
              >
                Restore access
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 font-medium text-fg">Video limit override</p>
          <div className="flex flex-wrap gap-2">
            <Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} className="max-w-[120px]" />
            <Button size="sm" disabled={pending || cap === ""} onClick={() => run(() => adminSetVideoCap(businessId, Number(cap)), "Cap updated")}>
              Apply
            </Button>
            {access.capIsOverride && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => adminSetVideoCap(businessId, null), "Reset to plan default")}
              >
                Reset to plan default
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-fg-subtle">
            Give any store — free or paid — a higher or lower limit than its plan, any time.
          </p>
        </div>

        <div className="rounded-lg border border-danger/30 p-3">
          <p className="mb-2 font-medium text-danger">Delete this store&apos;s videos</p>
          <Button
            variant="danger"
            size="sm"
            disabled={pending || access.used === 0}
            onClick={() => {
              if (confirm(`Delete all ${access.used} video(s) for this store? This can't be undone.`)) {
                run(() => adminWipeStoreVideos(businessId));
              }
            }}
          >
            Wipe video library
          </Button>
        </div>
      </div>
    </Card>
  );
}
