"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Plus, Trash2, Power, Play, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  addSearchKey,
  updateSearchKey,
  deleteSearchKey,
  reorderSearchKey,
  testSearchKey,
  type SearchKeyRow,
  type SearchProviderInfo,
} from "./actions";

export function WebSearchKeys({
  keys,
  providers,
}: {
  keys: SearchKeyRow[];
  providers: SearchProviderInfo[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<string>(providers[0]?.id ?? "tavily");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");

  const run = (fn: () => Promise<{ ok?: true; error?: string; count?: number }>, ok = "Saved") =>
    start(async () => {
      const res = await fn();
      if (res?.error) return toast(res.error, "error");
      toast(typeof res?.count === "number" ? `Working — ${res.count} results` : ok, "success");
      router.refresh();
    });

  const active = keys.find((k) => k.enabled);
  const pInfo = providers.find((p) => p.id === provider);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Web search
          </span>
        </CardTitle>
        <span className="text-xs text-fg-subtle">
          Keys the <code>web_search</code> tool uses — tried top to bottom
        </span>
      </CardHeader>

      <CardBody className="space-y-4">
        {keys.length === 0 && !adding && (
          <p className="text-sm text-fg-muted">
            No keys yet — web search falls back to a keyless scrape that our servers get blocked from, so it
            usually fails. Add a free key: {providers.map((p, i) => (
              <span key={p.id}>
                {i > 0 && " · "}
                <a href={p.signup} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                  {p.name}
                </a>{" "}
                <span className="text-fg-subtle">({p.hint})</span>
              </span>
            ))}
          </p>
        )}

        {keys.length > 0 && (
          <>
            <p className="text-xs text-fg-subtle">
              Active provider: <span className="font-medium text-fg">{active ? active.providerName : "none enabled"}</span>
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {keys.map((k, i) => {
                const used = k.usageCount;
                const limit = k.monthlyLimit ?? 0;
                const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                const near = limit > 0 && used / limit >= 0.85;
                return (
                  <li key={k.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">{k.providerName}</span>
                        {k.label && <span className="text-xs text-fg-subtle">{k.label}</span>}
                        <span className="text-xs text-fg-subtle">key {k.keyHint}</span>
                        {k.enabled ? <Badge tone="success">on</Badge> : <Badge tone="neutral">off</Badge>}
                        {k.lastStatus && k.lastStatus !== "ok" && <Badge tone="danger">last call failed</Badge>}
                      </span>
                      <span className="mt-1 block">
                        <span className="flex items-center gap-2 text-xs text-fg-subtle">
                          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
                            <span
                              className={`block h-full ${near ? "bg-danger" : "bg-primary"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span>
                            {used.toLocaleString()}
                            {limit ? ` / ${limit.toLocaleString()}` : ""} this month
                            {k.providerLeft != null ? ` · provider says ${k.providerLeft.toLocaleString()} left` : ""}
                          </span>
                        </span>
                        {k.lastUsedAt && (
                          <span className="text-xs text-fg-subtle">
                            last used {new Date(k.lastUsedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {k.lastStatus && k.lastStatus !== "ok" ? ` — ${k.lastStatus}` : ""}
                          </span>
                        )}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-1.5 text-fg-subtle">
                      <button
                        onClick={() => run(() => reorderSearchKey(k.id, "up"), "Reordered")}
                        disabled={pending || i === 0}
                        title="Try earlier"
                        className="disabled:opacity-30 hover:text-fg"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => run(() => reorderSearchKey(k.id, "down"), "Reordered")}
                        disabled={pending || i === keys.length - 1}
                        title="Try later"
                        className="disabled:opacity-30 hover:text-fg"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => run(() => testSearchKey(k.id))}
                        disabled={pending}
                        title="Test this key now"
                        className="hover:text-fg"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => run(() => updateSearchKey(k.id, { enabled: !k.enabled }), "Updated")}
                        disabled={pending}
                        title={k.enabled ? "Disable" : "Enable"}
                        className="hover:text-fg"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete this ${k.providerName} key?`)) run(() => deleteSearchKey(k.id), "Deleted");
                        }}
                        disabled={pending}
                        className="hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {adding ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Provider">
                <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="API key" hint={pInfo?.keyHint}>
                <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={pInfo?.keyHint} />
              </Field>
              <Field label="Label" hint="optional">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. personal free tier" />
              </Field>
            </div>
            {pInfo && (
              <p className="text-xs text-fg-subtle">
                {pInfo.hint} —{" "}
                <a href={pInfo.signup} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  get a key
                </a>
                . Free-tier cap defaults to {pInfo.monthlyLimit.toLocaleString()}/month (editable later).
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending || apiKey.trim().length < 8}
                onClick={() =>
                  run(async () => {
                    const res = await addSearchKey({ provider, apiKey, label });
                    if ("ok" in res) {
                      setAdding(false);
                      setApiKey("");
                      setLabel("");
                    }
                    return res;
                  }, "Key added")
                }
              >
                Save key
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add a key
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
