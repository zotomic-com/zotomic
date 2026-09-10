"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Network, Plus, Trash2, Copy, Check } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createMcpToken, deleteMcpToken, type McpTokenRow } from "./actions";

export function McpPanel({ tokens, url }: { tokens: McpTokenRow[]; url: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [allowWrites, setAllowWrites] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const del = (id: string) =>
    start(async () => {
      const res = await deleteMcpToken(id);
      if ("error" in res) return toast(res.error, "error");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" /> Zotomic as an MCP server
          </span>
        </CardTitle>
        <span className="text-xs text-fg-subtle">Drive Zotomic&apos;s tools from your own Claude / Cursor / any MCP client</span>
      </CardHeader>

      <CardBody className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
          <p className="text-fg-muted">Endpoint (Streamable HTTP):</p>
          <p className="mt-0.5 flex items-center gap-2 font-mono text-fg">
            {url}
            <button onClick={() => copy(url, "url")} className="text-fg-subtle hover:text-fg">
              {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </p>
          <p className="mt-1.5 text-fg-subtle">
            Add it with header <code>Authorization: Bearer &lt;token&gt;</code>. Read-only tokens can only call read tools;
            the capability + connector switches still apply.
          </p>
        </div>

        {fresh && (
          <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
            <p className="font-semibold text-warning">Copy this token now — it won&apos;t be shown again</p>
            <p className="mt-1 flex items-center gap-2 break-all font-mono text-xs text-fg">
              {fresh}
              <button onClick={() => copy(fresh, "fresh")} className="shrink-0 text-fg-subtle hover:text-fg">
                {copied === "fresh" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </p>
          </div>
        )}

        {tokens.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-fg">{t.label}</span>
                    {t.scopes.includes("write") ? <Badge tone="warning">read + write</Badge> : <Badge tone="neutral">read only</Badge>}
                  </span>
                  <span className="block text-xs text-fg-subtle">
                    {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleDateString("en-GB")}` : "never used"}
                  </span>
                </span>
                <button onClick={() => del(t.id)} disabled={pending} className="text-fg-subtle hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <Field label="Label">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My laptop Claude" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowWrites} onChange={(e) => setAllowWrites(e.target.checked)} className="h-4 w-4" />
              Allow write / consequential tools (suspend stores, grant credits, run SQL…)
            </label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await createMcpToken({ label, allowWrites });
                    if ("error" in res) return toast(res.error, "error");
                    setFresh(res.token);
                    setAdding(false);
                    setLabel("");
                    setAllowWrites(false);
                    router.refresh();
                  })
                }
              >
                Create token
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> New token
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
