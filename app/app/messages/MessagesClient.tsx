"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markThreadRead } from "./actions";

export interface Thread {
  key: string;
  provider: string;
  threadKey: string;
  name: string;
  messages: { id: string; direction: "in" | "out"; body: string; at: string; read: boolean }[];
  unread: number;
  lastAt: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

export function MessagesClient({ threads }: { threads: Thread[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  const current = threads.find((t) => t.key === active) ?? null;

  const markRead = (t: Thread) =>
    start(async () => {
      await markThreadRead(t.provider, t.threadKey);
      router.refresh();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card className={`p-0 ${current ? "hidden lg:block" : ""}`}>
        <ul className="divide-y divide-border">
          {threads.map((t) => (
            <li key={t.key}>
              <button
                onClick={() => {
                  setActive(t.key);
                  if (t.unread) markRead(t);
                }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2 ${
                  active === t.key ? "bg-surface-2" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-fg">{t.name}</span>
                    {t.unread > 0 && <Badge tone="primary">{t.unread}</Badge>}
                  </div>
                  <p className="truncate text-xs text-fg-muted">
                    {t.messages[t.messages.length - 1]?.body || "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-fg-subtle">
                    {PROVIDER_LABEL[t.provider] ?? t.provider} ·{" "}
                    {new Date(t.lastAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {current ? (
        <Card className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <button onClick={() => setActive(null)} className="lg:hidden text-fg-subtle">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-fg">{current.name}</p>
              <p className="text-xs text-fg-subtle">
                {PROVIDER_LABEL[current.provider] ?? current.provider}
              </p>
            </div>
            {current.unread > 0 && (
              <Button size="sm" variant="ghost" onClick={() => markRead(current)} disabled={pending}>
                <Check className="h-4 w-4" /> Mark read
              </Button>
            )}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {current.messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  m.direction === "out"
                    ? "ml-auto bg-primary-soft text-primary"
                    : "bg-surface-2 text-fg"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body || "(no text)"}</p>
                <p className="mt-1 text-[11px] text-fg-subtle">
                  {new Date(m.at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
          <p className="border-t border-border px-4 py-3 text-xs text-fg-subtle">
            Replies from Zotomic are coming soon — reply from the Facebook / WhatsApp app for now.
          </p>
        </Card>
      ) : (
        <Card className="hidden items-center justify-center p-10 text-sm text-fg-subtle lg:flex">
          Select a conversation
        </Card>
      )}
    </div>
  );
}
