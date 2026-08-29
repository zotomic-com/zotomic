"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp, Check, Sparkles, Wrench, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ToolTrace {
  tool: string;
  ok: boolean;
  ms: number;
}
interface PendingAction {
  id: string;
  tool: string;
  preview: string;
  risk?: string;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  traces?: ToolTrace[];
  pending?: PendingAction;
}

const SUGGESTIONS = [
  "How did revenue and profit move this week?",
  "Which products are low on stock?",
  "Who are my top repeat customers?",
  "Summarise the latest report",
];

export function AssistantChat({
  initialConversationId,
  initialMessages,
  readOnly,
}: {
  initialConversationId: string | null;
  initialMessages: Msg[];
  readOnly: boolean;
}) {
  const params = useSearchParams();
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const sentQ = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string, approveId?: string) => {
    if (busy) return;
    if (!approveId) {
      if (!text.trim()) return;
      setMessages((m) => [...m, { role: "user", content: text }]);
      setInput("");
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/assistant/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: approveId ? undefined : text, approveId }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Something went wrong.");
        return;
      }
      if (d.conversationId) setConversationId(d.conversationId);
      if (d.pendingAction) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `I'd like to make this change:`, traces: d.toolTraces, pending: d.pendingAction },
        ]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: d.reply, traces: d.toolTraces }]);
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  // auto-send ?q= from the dashboard panel
  useEffect(() => {
    const q = params.get("q");
    if (q && !sentQ.current) {
      sentQ.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvePending = (msgIdx: number, approve: boolean, id: string) => {
    setMessages((m) => m.map((x, i) => (i === msgIdx ? { ...x, pending: undefined, content: approve ? "Approved." : "Cancelled." } : x)));
    if (approve) send("", id);
  };

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col rounded border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold text-fg">Zotomic Assistant</span>
        <Badge tone="primary">Beta</Badge>
        {readOnly && <Badge tone="warning">read-only</Badge>}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md py-8 text-center">
            <p className="text-sm font-semibold text-fg">Ask about your business</p>
            <p className="mt-1 text-xs text-fg-muted">
              I work from your real, calculated numbers — I interpret them, I don&apos;t invent them.
            </p>
            <div className="mt-4 space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full rounded-sm border border-border px-3 py-2 text-left text-xs text-fg-muted hover:border-primary hover:bg-primary-soft"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "max-w-[80%] rounded-lg bg-primary px-3.5 py-2 text-sm text-primary-fg" : "max-w-[85%]"}>
              {m.role === "assistant" && m.traces && m.traces.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {m.traces.map((t, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-fg-subtle"
                    >
                      <Wrench className="h-2.5 w-2.5" />
                      {t.tool}
                    </span>
                  ))}
                </div>
              )}
              <p className={m.role === "assistant" ? "whitespace-pre-line text-sm text-fg" : "whitespace-pre-line"}>
                {m.content}
              </p>
              {m.pending && (
                <div className="mt-2 rounded-sm border border-warning/40 bg-warning-soft p-3">
                  <p className="text-xs font-semibold text-warning">Confirm change</p>
                  <p className="mt-0.5 text-sm text-fg">{m.pending.preview}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => resolvePending(i, true, m.pending!.id)}
                      className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg"
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => resolvePending(i, false, m.pending!.id)}
                      className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs font-semibold"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && <p className="text-xs text-fg-subtle">Thinking…</p>}
        {error && <p className="text-xs text-danger">{error}</p>}
        <div ref={endRef} />
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
          placeholder="Ask anything about your business…"
          className="h-10 flex-1 rounded-sm border border-border bg-app px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary text-primary-fg disabled:opacity-50"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
