"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Sparkles, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  saveStorefrontAssistant,
  resetStorefrontAssistant,
  deleteStorefrontConversation,
  loadStorefrontConversation,
  submitStorefrontChatTopup,
} from "./actions";

export interface SfConversation {
  id: string;
  who: string;
  registered: boolean;
  title: string;
  messages: number;
  lastAt: string;
}

interface State {
  live: boolean;
  ownerEnabled: boolean;
  suspended: boolean;
  suspendedReason: string | null;
  plan: string;
  quota: number;
  used: number;
  extra: number;
  remaining: number;
  displayName: string;
  defaultName: string;
  messagesThisMonth: number;
  blockedThisMonth: number;
}

interface Config {
  name: string;
  greeting: string;
  suggestedPrompts: string[];
}

interface Pack {
  id: string;
  conversations: number;
  price: number;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const day = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function StorefrontAssistantPanel({
  state,
  config,
  conversations,
  packs,
  payment,
  pendingTopup,
}: {
  state: State;
  config: Config;
  conversations: SfConversation[];
  packs: Pack[];
  payment: { bkash: string; nagad: string };
  pendingTopup: { conversations: number; amount: number; method: string } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [name, setName] = useState(config.name);
  const [greeting, setGreeting] = useState(config.greeting);
  const [prompts, setPrompts] = useState(config.suggestedPrompts.join("\n"));
  const dirty =
    name !== config.name ||
    greeting !== config.greeting ||
    prompts !== config.suggestedPrompts.join("\n");

  const [buyOpen, setBuyOpen] = useState(false);
  const [transcript, setTranscript] = useState<{ who: string; rows: { role: string; content: string; at: string }[] } | null>(
    null,
  );
  const [loadingTx, setLoadingTx] = useState(false);

  const run = (fn: () => Promise<{ ok: true } | { error: string }>, ok = "Saved") =>
    start(async () => {
      const res = await fn();
      if ("error" in res) return toast(res.error, "error");
      toast(ok, "success");
      router.refresh();
    });

  const toggle = () =>
    run(() => saveStorefrontAssistant({ enabled: !state.ownerEnabled }), state.ownerEnabled ? "Turned off" : "Turned on");

  const save = () =>
    run(() =>
      saveStorefrontAssistant({
        name,
        greeting,
        suggestedPrompts: prompts.split("\n").map((s) => s.trim()).filter(Boolean),
      }),
    );

  const openTranscript = async (c: SfConversation) => {
    setLoadingTx(true);
    const res = await loadStorefrontConversation(c.id);
    setLoadingTx(false);
    if ("error" in res) return toast(res.error, "error");
    setTranscript({ who: c.who, rows: res.messages });
  };

  const usedPct = state.quota ? Math.min(100, Math.round((state.used / state.quota) * 100)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Storefront assistant
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {state.suspended ? (
            <Badge tone="danger">Suspended by admin</Badge>
          ) : state.live ? (
            <Badge tone="success">Live</Badge>
          ) : (
            <Badge tone="neutral">Off</Badge>
          )}
          <Button size="sm" variant={state.ownerEnabled ? "ghost" : "primary"} onClick={toggle} disabled={pending || state.suspended}>
            {state.ownerEnabled ? "Turn off" : "Turn on"}
          </Button>
        </div>
      </CardHeader>

      <CardBody className="space-y-5">
        <p className="text-sm text-fg-muted">
          A chat assistant on your storefront that answers product, size, stock and delivery questions from your
          own catalogue and looks up orders for shoppers. Guests see it as{" "}
          <span className="font-medium text-fg">{state.displayName}</span>; signed-in shoppers see the Zotomic
          assistant.
        </p>

        {state.suspended && state.suspendedReason && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            {state.suspendedReason}
          </div>
        )}

        {/* Usage */}
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-fg">This month</span>
            <span className="text-fg-muted">
              {fmt(state.used)} / {fmt(state.quota)} conversations
              {state.extra > 0 ? ` · +${fmt(state.extra)} top-up` : ""}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full ${usedPct >= 100 ? "bg-danger" : "bg-primary"}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
            <span>{fmt(state.messagesThisMonth)} messages answered</span>
            {state.blockedThisMonth > 0 && <span className="text-danger">{fmt(state.blockedThisMonth)} turned away (limit)</span>}
            <span className="capitalize">{state.plan} plan</span>
          </div>
          <div className="mt-3">
            {pendingTopup ? (
              <p className="text-xs text-fg-muted">
                Top-up pending: {fmt(pendingTopup.conversations)} conversations (৳{pendingTopup.amount}, {pendingTopup.method}) — waiting for admin confirmation.
              </p>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setBuyOpen(true)}>
                Buy more conversations
              </Button>
            )}
          </div>
        </div>

        {/* Settings */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assistant name" hint="Shown to guests">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={state.defaultName} maxLength={60} />
          </Field>
          <Field label="Opening greeting">
            <Input
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Hi! How can I help you shop today?"
              maxLength={400}
            />
          </Field>
        </div>
        <Field label="Suggested questions" hint="One per line — shown as quick-start chips (max 6)">
          <Textarea
            rows={3}
            value={prompts}
            onChange={(e) => setPrompts(e.target.value)}
            placeholder={"Do you have this in size L?\nHow long is delivery?\nWhere is my order?"}
          />
        </Field>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (confirm("Turn the assistant off and clear its name, greeting and prompts?")) {
                run(() => resetStorefrontAssistant(), "Reset");
              }
            }}
            className="text-xs text-fg-subtle hover:text-danger"
          >
            Reset &amp; disable
          </button>
          {dirty && (
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          )}
        </div>

        {/* Conversations */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-fg">
            <MessageSquare className="h-4 w-4 text-fg-subtle" /> Recent conversations
          </p>
          {conversations.length === 0 ? (
            <p className="text-sm text-fg-subtle">No storefront conversations yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {conversations.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <button onClick={() => openTranscript(c)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-fg">{c.who}</span>
                      {c.registered && <Badge tone="primary">Registered</Badge>}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">{c.title}</span>
                  </button>
                  <span className="shrink-0 text-xs text-fg-subtle">{c.messages} msgs</span>
                  <span className="hidden shrink-0 text-xs text-fg-subtle sm:block">{day(c.lastAt)}</span>
                  <button
                    onClick={() => {
                      if (confirm("Delete this conversation?")) {
                        run(() => deleteStorefrontConversation(c.id), "Deleted");
                      }
                    }}
                    className="shrink-0 text-fg-subtle hover:text-danger"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>

      {/* Buy modal */}
      <Modal open={buyOpen} onClose={() => setBuyOpen(false)} title="Buy more conversations">
        <BuyForm
          packs={packs}
          payment={payment}
          onDone={() => {
            setBuyOpen(false);
            router.refresh();
          }}
        />
      </Modal>

      {/* Transcript modal */}
      <Modal open={!!transcript} onClose={() => setTranscript(null)} title={`Chat — ${transcript?.who ?? ""}`} size="lg">
        {loadingTx ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" />
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {transcript?.rows.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-primary text-white" : "border border-border bg-surface-2"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Card>
  );
}

function BuyForm({
  packs,
  payment,
  onDone,
}: {
  packs: Pack[];
  payment: { bkash: string; nagad: string };
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [packId, setPackId] = useState<string | null>(null);
  const [method, setMethod] = useState<"bkash" | "nagad">(payment.bkash ? "bkash" : "nagad");
  const pack = packs.find((p) => p.id === packId) ?? null;
  const number = method === "bkash" ? payment.bkash : payment.nagad;

  const submit = (form: FormData) =>
    start(async () => {
      const res = await submitStorefrontChatTopup(form);
      if ("error" in res) return toast(res.error, "error");
      toast("Submitted — an admin will confirm shortly.", "success");
      onDone();
    });

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {packs.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPackId(p.id)}
            className={`rounded-lg border p-3 text-left text-sm ${
              packId === p.id ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <span className="block font-semibold text-fg">{p.conversations.toLocaleString("en-US")}</span>
            <span className="text-xs text-fg-subtle">৳{p.price}</span>
          </button>
        ))}
      </div>
      <input type="hidden" name="pack" value={packId ?? ""} />

      <div className="flex gap-2">
        {(["bkash", "nagad"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize ${
              method === m ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <input type="hidden" name="method" value={method} />

      {number ? (
        <p className="text-sm text-fg-muted">
          Send ৳{pack?.price ?? "—"} to <span className="font-semibold text-fg">{number}</span> ({method}), then enter
          the transaction ID below.
        </p>
      ) : (
        <p className="text-sm text-danger">No {method} number is configured yet. Contact Zotomic support.</p>
      )}

      <Field label="Transaction ID">
        <Input name="txn_id" placeholder="e.g. 9AB2C3D4E5" required />
      </Field>

      <Button type="submit" disabled={pending || !pack || !number} className="w-full">
        {pending ? "Submitting…" : pack ? `Submit — ৳${pack.price}` : "Pick a pack"}
      </Button>
    </form>
  );
}
