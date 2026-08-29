"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { savePlatformSettings } from "./actions";

interface F {
  key: string;
  label: string;
  secret: boolean;
  value: string;
}

export function PlatformSettingsForm({ fields }: { fields: F[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const telegram = fields.filter((f) => f.key.startsWith("telegram"));
  const tracking = fields.filter((f) => !f.key.startsWith("telegram"));

  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await savePlatformSettings(fd);
          toast(res.note ?? "Settings saved", res.note && res.note.includes(":") ? "error" : "success");
          router.refresh();
        })
      }
      className="space-y-5"
    >
      <Card>
        <CardHeader>
          <CardTitle>Telegram bot</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            Create a bot with @BotFather, paste the token here. Store owners set their chat ID in
            Settings, then the assistant can deliver reports to Telegram.
          </p>
          {telegram.map((f) => (
            <Field key={f.key} label={f.label}>
              <Input name={f.key} type={f.secret ? "password" : "text"} defaultValue={f.value} autoComplete="off" />
            </Field>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>zotomic.com tracking</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-muted">
            Meta Pixel (client-side) and Google Analytics 4 (client + server-side via the Measurement
            Protocol) for the marketing site.
          </p>
          {tracking.map((f) => (
            <Field key={f.key} label={f.label}>
              <Input name={f.key} type={f.secret ? "password" : "text"} defaultValue={f.value} autoComplete="off" />
            </Field>
          ))}
        </CardBody>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
