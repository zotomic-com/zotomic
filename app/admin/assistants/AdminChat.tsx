"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "What needs my attention right now?",
  "Show me pending payments",
  "Platform overview",
  "Which storefront assistants are turning shoppers away?",
];

const LS_KEY = "zt_admin_chat";
const TTL = 7 * 24 * 60 * 60 * 1000; // keep the admin chat for a week

function loadCache(): { convId: string | null; messages: Msg[] } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { convId: null, messages: [] };
    const p = JSON.parse(raw) as { at: number; convId: string | null; messages: Msg[] };
    if (!p?.at || Date.now() - p.at > TTL || !Array.isArray(p.messages)) {
      localStorage.removeItem(LS_KEY);
      return { convId: null, messages: [] };
    }
    return { convId: p.convId ?? null, messages: p.messages };
  } catch {
    return { convId: null, messages: [] };
  }
}

function saveCache(convId: string | null, messages: Msg[]) {
  try {
    if (!messages.length) return localStorage.removeItem(LS_KEY);
    localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), convId, messages: messages.slice(-60) }));
  } catch {
    /* private mode / quota */
  }
}

export function AdminChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = loadCache();
    convId.current = c.convId;
    if (c.messages.length) setMessages(c.messages);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, pending]);

  useEffect(() => {
    saveCache(convId.current, messages);
  }, [messages]);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, conversationId: convId.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Something went wrong.");
        return null;
      }
      convId.current = data.conversationId ?? convId.current;
      return data as { reply: string | null; pending: { preview: string } | null };
    } catch {
      setError("Network error.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    const data = await call({ message: msg });
    if (!data) {
      setMessages((m) => m.slice(0, -1));
      setInput(msg);
      return;
    }
    if (data.pending) setPending(data.pending.preview);
    else if (data.reply) setMessages((m) => [...m, { role: "assistant", content: data.reply as string }]);
  };

  const confirm = async (approve: boolean) => {
    setPending(null);
    const data = await call(approve ? { approve: true } : { cancel: true });
    if (data?.reply) setMessages((m) => [...m, { role: "assistant", content: data.reply as string }]);
  };

  const newChat = () => {
    setMessages([]);
    setPending(null);
    setError(null);
    convId.current = null;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <Card className="flex flex-col" >
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Zotomic — your admin assistant
          </span>
        </CardTitle>
        <span className="flex items-center gap-3 text-xs text-fg-subtle">
          {messages.length > 0 && (
            <button onClick={newChat} className="font-medium text-primary hover:underline">
              New chat
            </button>
          )}
          <span>Acts through tools · confirms every change</span>
        </span>
      </CardHeader>

      <CardBody className="flex h-[460px] flex-col p-0">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !pending && (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">
                Ask about the platform or tell me to do something — suspend a store, grant credits, resolve a payment,
                edit a store&apos;s assistant. I&apos;ll confirm before anything changes.
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted hover:border-primary hover:text-fg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                  m.role === "user" ? "bg-primary text-primary-fg" : "border border-border bg-surface-2 text-fg"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-border bg-surface-2 px-3.5 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" />
              </div>
            </div>
          )}

          {pending && (
            <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-warning">
                <ShieldAlert className="h-4 w-4" /> Confirm this action
              </p>
              <code className="mt-1 block break-all text-xs text-fg">{pending}</code>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => confirm(true)} disabled={busy}>
                  Run it
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-center text-xs text-danger">{error}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask or instruct…"
            disabled={busy}
            className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" size="sm" disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
