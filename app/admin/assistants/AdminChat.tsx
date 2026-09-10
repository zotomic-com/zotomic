"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, Loader2, ShieldAlert, Paperclip, X } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Attach {
  name: string;
  mimeType: string;
  dataBase64: string;
  size: number;
}

const STARTERS = [
  "What needs my attention right now?",
  "Show me pending payments",
  "Platform overview",
  "Which storefront assistants are turning shoppers away?",
];

const LS_KEY = "zt_admin_chat";
const TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTACH_BYTES = 15 * 1024 * 1024;
const OK_MIME = /^(image|audio|video)\//i;

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

const fileToBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ""));
    r.onerror = reject;
    r.readAsDataURL(f);
  });

export function AdminChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ preview: string; confirmWord: string | null } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attach, setAttach] = useState<Attach[]>([]);
  const convId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      return data as { reply: string | null; pending: { preview: string; confirmWord: string | null } | null };
    } catch {
      setError("Network error.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const pickFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Attach[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (!OK_MIME.test(f.type)) {
        setError(`${f.name}: only images, audio and video.`);
        continue;
      }
      if (f.size > MAX_ATTACH_BYTES) {
        setError(`${f.name} is over 15 MB.`);
        continue;
      }
      next.push({ name: f.name, mimeType: f.type, dataBase64: await fileToBase64(f), size: f.size });
    }
    setAttach((a) => [...a, ...next].slice(0, 4));
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async (text: string) => {
    const msg = text.trim();
    if ((!msg && !attach.length) || busy) return;
    setInput("");
    const sending = attach;
    setAttach([]);
    const label = sending.length ? `${msg}${msg ? "\n" : ""}📎 ${sending.map((a) => a.name).join(", ")}` : msg;
    setMessages((m) => [...m, { role: "user", content: label }]);
    const data = await call({
      message: msg,
      attachments: sending.map((a) => ({ name: a.name, mimeType: a.mimeType, dataBase64: a.dataBase64 })),
    });
    if (!data) {
      setMessages((m) => m.slice(0, -1));
      setInput(msg);
      setAttach(sending);
      return;
    }
    if (data.pending) {
      setPending(data.pending);
      setConfirmInput("");
    } else if (data.reply) setMessages((m) => [...m, { role: "assistant", content: data.reply as string }]);
  };

  const confirm = async (approve: boolean) => {
    const word = pending?.confirmWord;
    if (approve && word && confirmInput.trim().toUpperCase() !== word.toUpperCase()) return;
    setPending(null);
    setConfirmInput("");
    const data = await call(approve ? { approve: true, confirmText: word ? confirmInput.trim() : undefined } : { cancel: true });
    if (data?.pending) setPending(data.pending);
    else if (data?.reply) setMessages((m) => [...m, { role: "assistant", content: data.reply as string }]);
  };

  const newChat = () => {
    setMessages([]);
    setPending(null);
    setError(null);
    setAttach([]);
    convId.current = null;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  };

  const wordOk = !pending?.confirmWord || confirmInput.trim().toUpperCase() === pending.confirmWord.toUpperCase();

  return (
    <Card className="flex flex-col">
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
                Ask about the platform or tell me to do something. Attach an image, voice note or short video and
                I&apos;ll read it. With the right powers switched on I can also touch the codebase, database and deploys —
                every one confirmed.
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
              <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded bg-surface p-2 text-xs text-fg">
                {pending.preview}
              </pre>
              {pending.confirmWord && (
                <div className="mt-2">
                  <label className="text-xs text-fg-muted">
                    Type <span className="font-mono font-bold text-fg">{pending.confirmWord}</span> to allow it:
                  </label>
                  <input
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    className="mt-1 w-40 rounded-sm border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-danger"
                    placeholder={pending.confirmWord}
                  />
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => confirm(true)} disabled={busy || !wordOk}>
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

        {attach.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border px-3 pt-2">
            {attach.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-fg-muted">
                {a.name.slice(0, 24)}
                <button onClick={() => setAttach((x) => x.filter((_, j) => j !== i))} className="hover:text-danger">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,audio/*,video/*"
            multiple
            hidden
            onChange={(e) => pickFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="shrink-0 rounded-sm border border-border p-2 text-fg-subtle hover:text-fg"
            title="Attach image / voice / video"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask or instruct…"
            disabled={busy}
            className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" size="sm" disabled={busy || (!input.trim() && !attach.length)}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
