"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plug, Plus, Trash2, Power, Play, ChevronDown } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  addConnector,
  updateConnector,
  deleteConnector,
  testConnector,
  type ConnectorRow,
  type ConnectorProviderInfo,
} from "./actions";

export function ConnectorsPanel({
  connectors,
  providers,
}: {
  connectors: ConnectorRow[];
  providers: ConnectorProviderInfo[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<string>(providers[0]?.id ?? "slack");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [cfg, setCfg] = useState<Record<string, string>>({});

  const pInfo = providers.find((p) => p.id === provider);

  const run = (fn: () => Promise<{ ok?: true; error?: string; detail?: string }>, ok = "Saved") =>
    start(async () => {
      const res = await fn();
      if (res?.error) return toast(res.error, "error");
      toast(res?.detail || ok, "success");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" /> Connectors
          </span>
        </CardTitle>
        <span className="text-xs text-fg-subtle">External services Zotomic can use — tools appear only while a connector is on</span>
      </CardHeader>

      <CardBody className="space-y-4">
        {connectors.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {connectors.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{c.providerName}</span>
                    {c.label && c.label !== c.providerName && <span className="text-xs text-fg-subtle">{c.label}</span>}
                    <span className="text-xs text-fg-subtle">token {c.tokenHint}</span>
                    {c.enabled ? <Badge tone="success">on</Badge> : <Badge tone="neutral">off</Badge>}
                    {c.status && c.status !== "ok" && <Badge tone="danger">error</Badge>}
                  </span>
                  {c.meta && Object.keys(c.meta).length > 0 && (
                    <span className="block text-xs text-fg-subtle">
                      {Object.entries(c.meta).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </span>
                  )}
                  {c.status && c.status !== "ok" && <span className="block text-xs text-danger">{c.status}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-fg-subtle">
                  <button onClick={() => run(() => testConnector(c.id))} disabled={pending} title="Test" className="hover:text-fg">
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => run(() => updateConnector(c.id, { enabled: !c.enabled }), "Updated")}
                    disabled={pending}
                    title={c.enabled ? "Disable" : "Enable"}
                    className="hover:text-fg"
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove the ${c.providerName} connector?`)) run(() => deleteConnector(c.id), "Removed");
                    }}
                    disabled={pending}
                    className="hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Service">
                <Select value={provider} onChange={(e) => { setProvider(e.target.value); setCfg({}); }}>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.oauth}>
                      {p.name}
                      {p.oauth ? " (soon)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Label" hint="optional">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. #ops workspace" />
              </Field>
              <Field label={pInfo?.tokenLabel ?? "Token"}>
                <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste token" />
              </Field>
              {pInfo?.configFields.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Input value={cfg[f.key] ?? ""} onChange={(e) => setCfg((c) => ({ ...c, [f.key]: e.target.value }))} />
                </Field>
              ))}
            </div>
            {pInfo && <p className="text-xs text-fg-subtle">{pInfo.setup}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending || token.trim().length < 8}
                onClick={() =>
                  run(async () => {
                    const res = await addConnector({ provider, label, token, config: cfg });
                    if ("ok" in res) {
                      setAdding(false);
                      setToken("");
                      setLabel("");
                      setCfg({});
                    }
                    return res;
                  }, "Connected")
                }
              >
                Connect
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add a connector
            </Button>
            <span className="text-xs text-fg-subtle">
              Available: {providers.map((p) => p.name.split(" ")[0]).join(" · ")}
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
