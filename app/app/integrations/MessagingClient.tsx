"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { connectMessaging, disconnectMessaging } from "./actions";
import type { MessagingProviderId } from "@/lib/messaging";

interface Provider {
  id: MessagingProviderId;
  name: string;
  blurb: string;
  fields: { key: string; label: string; type: "text" | "password"; optional?: boolean }[];
}
interface Channel {
  provider: string;
  status: string;
  verifyToken: string;
  lastEventAt: string | null;
  lastError: string | null;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return (
    <div className="rounded-sm border border-border bg-surface-2 p-2 text-xs">
      <p className="font-semibold text-fg-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 truncate text-fg">{value}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            toast("Copied", "info");
          }}
          className="text-fg-subtle hover:text-fg"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function MessagingSection({
  webhookUrl,
  providers,
  channels,
}: {
  webhookUrl: string;
  providers: Provider[];
  channels: Channel[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Provider | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});

  const open = (p: Provider) => {
    setCreds({});
    setEditing(p);
  };

  const save = () =>
    start(async () => {
      const res = await connectMessaging({ provider: editing!.id, creds });
      if ("error" in res) toast(res.error, "error");
      else {
        toast(`${editing!.name} connected`, "success");
        setEditing(null);
        router.refresh();
      }
    });

  const remove = (id: string, name: string) =>
    start(async () => {
      await disconnectMessaging(id);
      toast(`${name} disconnected`, "info");
      router.refresh();
    });

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-fg">Messaging &amp; social inbox</h2>
        <Badge tone="neutral">Every plan</Badge>
      </div>
      <p className="mt-0.5 text-sm text-fg-muted">
        Connect your own Facebook Page, WhatsApp Business number or Instagram. Incoming messages land
        in your Messages inbox. Each channel is separate to your store.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => {
          const c = channels.find((x) => x.provider === p.id);
          return (
            <div key={p.id} className="rounded border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <MessageSquareText className="h-4 w-4 text-primary" />
                  {p.name}
                </span>
                {c?.status === "connected" ? (
                  <Badge tone="success">
                    <CheckCircle2 className="h-3 w-3" /> connected
                  </Badge>
                ) : c?.status === "error" ? (
                  <Badge tone="danger">error</Badge>
                ) : (
                  <Badge tone="neutral">not connected</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-fg-muted">{p.blurb}</p>
              {c?.lastError && <p className="mt-2 text-xs text-danger">{c.lastError}</p>}
              {c?.lastEventAt && (
                <p className="mt-1 text-xs text-fg-subtle">
                  Last message {new Date(c.lastEventAt).toLocaleString("en-US")}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant={c ? "outline" : "primary"} onClick={() => open(p)}>
                  {c ? "Update" : "Connect"}
                </Button>
                {c && (
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id, p.name)} disabled={pending}>
                    Disconnect
                  </Button>
                )}
              </div>
              {c?.status === "connected" && (
                <div className="mt-3 space-y-2">
                  <CopyRow label="Callback / Webhook URL" value={webhookUrl} />
                  <CopyRow label="Verify token" value={c.verifyToken} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Connect ${editing?.name ?? ""}`}>
        {editing && (
          <div className="space-y-3">
            <p className="text-xs text-fg-subtle">
              Create an app in Meta for Developers, add the <b>{editing.name}</b> product, and paste
              the credentials below. After saving you&apos;ll get a webhook URL and verify token to
              register in the app&apos;s webhook settings. Secrets are encrypted (AES-256).
            </p>
            {editing.fields.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input
                  type={f.type}
                  value={creds[f.key] ?? ""}
                  onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                  autoComplete="off"
                />
              </Field>
            ))}
            <Button onClick={save} disabled={pending} className="w-full">
              {pending ? "Saving…" : "Save & get webhook URL"}
            </Button>
          </div>
        )}
      </Modal>
    </section>
  );
}
