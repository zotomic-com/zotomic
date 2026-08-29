"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { saveTrackingSettings } from "./actions";

export function TrackingSection({
  pixelId,
  ga4Id,
  capiConnected,
}: {
  pixelId: string;
  ga4Id: string;
  capiConnected: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [pixel, setPixel] = useState(pixelId);
  const [ga4, setGa4] = useState(ga4Id);
  const [capi, setCapi] = useState("");

  const save = () =>
    start(async () => {
      await saveTrackingSettings({ metaPixelId: pixel, ga4MeasurementId: ga4, metaCapiToken: capi });
      toast("Tracking saved", "success");
      setCapi("");
      router.refresh();
    });

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-fg">Tracking &amp; pixels</h2>
        <Badge tone="neutral">Every plan</Badge>
      </div>
      <p className="mt-0.5 text-sm text-fg-muted">
        Your own Meta Pixel and Google Analytics for your storefront. Events fire for page views,
        product views, add-to-cart, checkout and purchases.
      </p>

      <div className="mt-3 rounded border border-border bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Meta Pixel ID">
            <Input
              value={pixel}
              onChange={(e) => setPixel(e.target.value)}
              placeholder="e.g. 123456789012345"
              inputMode="numeric"
            />
          </Field>
          <Field label="GA4 Measurement ID">
            <Input value={ga4} onChange={(e) => setGa4(e.target.value)} placeholder="G-XXXXXXXXXX" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Meta Conversions API token (optional — server-side events)">
              <Input
                type="password"
                value={capi}
                onChange={(e) => setCapi(e.target.value)}
                placeholder={capiConnected ? "•••••••• (saved — leave blank to keep)" : "EAAG…"}
                autoComplete="off"
              />
            </Field>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={pending}>
            <BarChart3 className="h-4 w-4" /> {pending ? "Saving…" : "Save tracking"}
          </Button>
          {capiConnected && <Badge tone="success">Conversions API connected</Badge>}
        </div>
      </div>
    </section>
  );
}
