"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, Plus, Power } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  addTelegramBot,
  updateTelegramBot,
  deleteTelegramBot,
  testTelegramBot,
  type TgBotRow,
} from "./actions";

export function TelegramBots({ bots, webhookUrl }: { bots: TgBotRow[]; webhookUrl: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");

  const run = (fn: () => Promise<{ ok?: true; error?: string; username?: string }>, ok = "Saved") =>
    start(async () => {
      const res = await fn();
      if (res?.error) return toast(res.error, "error");
      toast(res?.username ? `Connected @${res.username}` : ok, "success");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Telegram
          </span>
        </CardTitle>
        <span className="text-xs text-fg-subtle">Chat with Zotomic from Telegram</span>
      </CardHeader>

      <CardBody className="space-y-4">
        {bots.length === 0 && !adding && (
          <p className="text-sm text-fg-muted">
            No bots connected. Create a bot with @BotFather, then add its token here to chat with Zotomic over Telegram.
          </p>
        )}

        {bots.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {bots.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-fg">{b.label}</span>
                    {b.botUsername && <span className="text-xs text-fg-subtle">@{b.botUsername}</span>}
                    {b.enabled ? <Badge tone="success">on</Badge> : <Badge tone="neutral">off</Badge>}
                  </span>
                  <span className="block text-xs text-fg-subtle">
                    chat {b.chatId} · token {b.tokenHint}
                    {b.lastInboundAt ? ` · last msg ${new Date(b.lastInboundAt).toLocaleDateString("en-US")}` : ""}
                  </span>
                </span>
                <button
                  onClick={() => run(() => testTelegramBot(b.id), "Test sent")}
                  className="text-fg-subtle hover:text-fg"
                  title="Send a test message"
                  disabled={pending}
                >
                  <Send className="h-4 w-4" />
                </button>
                <button
                  onClick={() => run(() => updateTelegramBot(b.id, { enabled: !b.enabled }), "Updated")}
                  className="text-fg-subtle hover:text-fg"
                  title={b.enabled ? "Disable" : "Enable"}
                  disabled={pending}
                >
                  <Power className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Remove "${b.label}"? Its Telegram webhook will be deleted.`))
                      run(() => deleteTelegramBot(b.id), "Removed");
                  }}
                  className="text-fg-subtle hover:text-danger"
                  disabled={pending}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Label">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My phone" />
              </Field>
              <Field label="Bot token" hint="from @BotFather">
                <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456:ABC-DEF…" />
              </Field>
              <Field label="Your chat ID" hint="from @userinfobot">
                <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
              </Field>
            </div>
            <p className="text-xs text-fg-subtle">
              Message your bot once first (send it any text) so Telegram allows it to reply. Webhook: <code>{webhookUrl}</code>
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending || !token.trim() || !chatId.trim()}
                onClick={() =>
                  run(async () => {
                    const res = await addTelegramBot({ label, token, chatId });
                    if ("ok" in res) {
                      setAdding(false);
                      setLabel("");
                      setToken("");
                      setChatId("");
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
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add a bot
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
