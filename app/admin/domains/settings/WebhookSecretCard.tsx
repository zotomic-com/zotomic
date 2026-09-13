"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { regenerateWebhookSecretAction } from "../actions";

export function WebhookSecretCard({ siteUrl, hasSecret }: { siteUrl: string; hasSecret: boolean }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const webhookUrl = `${siteUrl}/api/domains/sms-webhook`;

  const regenerate = () =>
    start(async () => {
      const res = await regenerateWebhookSecretAction();
      setRevealed(res.secret);
      toast("New secret generated — copy it now, it won't be shown again", "success");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>SMS payment webhook</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-fg-muted">
          Point your phone&apos;s SMS-forwarding app at this URL. It must send a header{" "}
          <code className="rounded-sm bg-surface-2 px-1">x-webhook-secret</code> matching the secret below, and a JSON body{" "}
          <code className="rounded-sm bg-surface-2 px-1">{"{ \"text\": \"<the raw SMS>\" }"}</code>.
        </p>
        <div className="rounded-sm border border-border bg-surface-2 p-3 font-mono text-xs break-all">{webhookUrl}</div>
        {revealed ? (
          <div className="rounded-sm border border-primary bg-primary-soft p-3">
            <p className="text-xs font-semibold text-primary">Copy this now — shown only once</p>
            <p className="mt-1 break-all font-mono text-xs text-fg">{revealed}</p>
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">{hasSecret ? "A secret is set (hidden)." : "No secret set yet — generate one before pointing a device at the webhook."}</p>
        )}
        <Button size="sm" variant="secondary" disabled={pending} onClick={regenerate}>
          {pending ? "Generating…" : hasSecret ? "Regenerate secret" : "Generate secret"}
        </Button>
      </CardBody>
    </Card>
  );
}
