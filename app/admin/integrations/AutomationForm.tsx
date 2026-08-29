"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { saveAutomationSettings } from "./actions";

interface F {
  key: string;
  label: string;
  secret: boolean;
  value: string;
}

export function AutomationForm({ fields }: { fields: F[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const hermes = fields.filter((f) => f.key.startsWith("hermes"));
  const n8n = fields.filter((f) => f.key.startsWith("n8n"));
  const meta = fields.filter((f) => f.key.startsWith("meta"));

  const group = (title: string, blurb: string, list: F[]) => (
    <Card key={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-fg-muted">{blurb}</p>
        {list.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              name={f.key}
              type={f.secret ? "password" : "text"}
              defaultValue={f.value}
              autoComplete="off"
              placeholder={f.secret ? "" : "https://…"}
            />
          </Field>
        ))}
      </CardBody>
    </Card>
  );

  return (
    <form
      action={(fd) =>
        start(async () => {
          await saveAutomationSettings(fd);
          toast("Saved", "success");
          router.refresh();
        })
      }
      className="space-y-5"
    >
      {group(
        "Hermes agent gateway",
        "Base URL + shared secret for the Hermes VPS. Stored now; the assistant keeps running on the built-in loop until a URL is set here.",
        hermes,
      )}
      {group(
        "n8n automation",
        "Connect your n8n instance for workflow automations (order events, message routing, report fan-out). Stored now, wired later.",
        n8n,
      )}
      {group(
        "Meta webhook fallback",
        "Optional platform-wide Meta app secret used to verify Messenger / WhatsApp webhook signatures when a store hasn't supplied its own.",
        meta,
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save credentials"}
      </Button>
    </form>
  );
}
