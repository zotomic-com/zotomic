"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { setAssistantCap, type AssistantAction } from "./actions";
import type { AssistantCaps } from "@/lib/ai/assistant-powers";
import type { AdminCapability } from "@/lib/tools/admin-registry";

const ORDER: { cap: AdminCapability; danger: boolean; needsEnv?: "git" | "sql" | "deploy"; typed?: string }[] = [
  { cap: "media", danger: false },
  { cap: "files", danger: false },
  { cap: "git", danger: true, needsEnv: "git" },
  { cap: "git_merge", danger: true, needsEnv: "git", typed: "MERGE" },
  { cap: "sql", danger: true, needsEnv: "sql", typed: "RUN" },
  { cap: "deploy", danger: true, needsEnv: "deploy", typed: "DEPLOY" },
];

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-primary" : "bg-border"}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-4" : "left-0.5"}`} />
    </button>
  );
}

export function AssistantPowers({
  caps,
  labels,
  recent,
  envReady,
}: {
  caps: AssistantCaps;
  labels: Record<string, string>;
  recent: AssistantAction[];
  envReady: { git: boolean; sql: boolean; deploy: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<AdminCapability | null>(null);
  const [, start] = useTransition();

  const flip = (cap: AdminCapability, next: boolean, danger: boolean) => {
    if (next && danger && !confirm(`Enable "${labels[cap]}" for the assistant? Every use is still confirmed individually.`)) return;
    setPendingId(cap);
    start(async () => {
      const res = await setAssistantCap(cap, next);
      setPendingId(null);
      if ("error" in res) return toast(res.error, "error");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Capabilities & workspace
          </span>
        </CardTitle>
        <span className="text-xs text-fg-subtle">What Zotomic is allowed to do — off by default, every use confirmed</span>
      </CardHeader>

      <CardBody className="space-y-4">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {ORDER.map(({ cap, danger, needsEnv, typed }) => {
            const on = caps[cap];
            const missing = needsEnv && !envReady[needsEnv];
            return (
              <li key={cap} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <Toggle
                  on={on}
                  disabled={pendingId === cap || !!missing}
                  onClick={() => flip(cap, !on, danger)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{labels[cap]}</span>
                    {danger && <Badge tone="warning">sensitive</Badge>}
                    {typed && <span className="text-xs text-fg-subtle">needs typed “{typed}”</span>}
                  </span>
                  {missing && (
                    <span className="flex items-center gap-1 text-xs text-danger">
                      <AlertTriangle className="h-3 w-3" /> not configured on the server — set the {needsEnv} env vars first
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-fg-subtle">
          Workspace: a private folder (<code>assistant-workspace</code>) Zotomic and you share. Reads show in the chat;
          writes and deletes are confirmed. Git changes always go to a new branch + PR — never straight to main.
        </p>

        {recent.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Recent actions</p>
            <ul className="space-y-1 text-xs">
              {recent.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${a.outcome === "ok" ? "bg-success" : "bg-danger"}`} />
                  <span className="text-fg-muted">
                    <span className="font-mono text-fg-subtle">{a.kind}</span> — {a.summary}{" "}
                    <span className="text-fg-subtle">· {new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
