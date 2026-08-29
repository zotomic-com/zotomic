"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { connectIntegration, disconnectIntegration } from "./actions";

interface Provider {
  id: string;
  name: string;
  fields: { key: string; label: string; type: "text" | "password" }[];
}
interface Connected {
  provider: string;
  status: string;
  mode: string;
  lastError: string | null;
  connectedAt: string | null;
}

export function IntegrationSection({
  title,
  description,
  category,
  providers,
  connected,
  locked,
  lockMessage,
}: {
  title: string;
  description: string;
  category: "payment" | "courier";
  providers: Provider[];
  connected: Connected[];
  locked?: boolean;
  lockMessage?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Provider | null>(null);
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");
  const [creds, setCreds] = useState<Record<string, string>>({});

  const open = (p: Provider) => {
    const c = connected.find((x) => x.provider === p.id);
    setMode((c?.mode as "sandbox" | "live") ?? "sandbox");
    setCreds({});
    setEditing(p);
  };

  const save = () =>
    start(async () => {
      const res = await connectIntegration({ category, provider: editing!.id, mode, creds });
      if ("error" in res && res.error) toast(res.error, "error");
      else {
        toast(`${editing!.name} connected (${mode})`, "success");
        setEditing(null);
        router.refresh();
      }
    });

  const remove = (id: string, name: string) =>
    start(async () => {
      await disconnectIntegration(id);
      toast(`${name} disconnected`, "info");
      router.refresh();
    });

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-fg">{title}</h2>
        {locked && <Badge tone="warning">Paid plan</Badge>}
      </div>
      <p className="mt-0.5 text-sm text-fg-muted">{description}</p>

      {locked ? (
        <div className="mt-3 flex items-center gap-3 rounded border border-border bg-surface-2 p-4 text-sm">
          <Lock className="h-4 w-4 shrink-0 text-fg-subtle" />
          <span className="text-fg-muted">{lockMessage}</span>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => {
            const c = connected.find((x) => x.provider === p.id);
            return (
              <div key={p.id} className="rounded border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <Plug className="h-4 w-4 text-primary" />
                    {p.name}
                  </span>
                  {c?.status === "connected" ? (
                    <Badge tone="success">
                      <CheckCircle2 className="h-3 w-3" /> {c.mode}
                    </Badge>
                  ) : c?.status === "error" ? (
                    <Badge tone="danger">error</Badge>
                  ) : (
                    <Badge tone="neutral">not connected</Badge>
                  )}
                </div>
                {c?.lastError && <p className="mt-2 text-xs text-danger">{c.lastError}</p>}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant={c?.status === "connected" ? "outline" : "primary"} onClick={() => open(p)}>
                    {c ? "Update" : "Connect"}
                  </Button>
                  {c && (
                    <Button size="sm" variant="ghost" onClick={() => remove(p.id, p.name)} disabled={pending}>
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Connect ${editing?.name ?? ""}`}>
        {editing && (
          <div className="space-y-3">
            <div className="flex rounded-sm border border-border bg-surface-2 p-1 text-sm">
              {(["sandbox", "live"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-[8px] px-3 py-1.5 font-medium capitalize ${
                    mode === m ? "bg-surface text-fg shadow-sm" : "text-fg-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-subtle">
              Use your <b>{editing.name}</b> merchant credentials. Start with sandbox to test, then
              switch to live. Secrets are encrypted (AES-256).
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
              {pending ? "Validating…" : "Validate & save"}
            </Button>
          </div>
        )}
      </Modal>
    </section>
  );
}
