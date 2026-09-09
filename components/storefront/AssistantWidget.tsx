"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";

interface Bootstrap {
  enabled: boolean;
  name: string;
  greeting: string;
  prompts: string[];
  registered: boolean;
  unavailable: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const convKey = (slug: string) => `zt_sf_chat_conv_${slug}`;

/** Linkify bare storefront links + **bold** in assistant replies. */
function renderContent(text: string) {
  const parts = text.split(/(\bhttps?:\/\/\S+|\/[A-Za-z0-9/_-]*products\/[A-Za-z0-9_-]+|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^(https?:\/\/|\/)/.test(p)) {
      return (
        <a key={i} href={p} className="underline" style={{ color: "var(--sf-accent)" }}>
          {p.replace(/^https?:\/\//, "")}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function AssistantWidget({ storeSlug }: { storeSlug: string }) {
  const pathname = usePathname();
  const isImmersivePdp = /\/products\/[^/]+$/.test(pathname || "");

  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/storefront/assistant?store=${encodeURIComponent(storeSlug)}`)
      .then((r) => r.json())
      .then((d: Bootstrap) => {
        if (alive && d?.enabled) setBoot(d);
      })
      .catch(() => undefined);
    try {
      convId.current = localStorage.getItem(convKey(storeSlug));
    } catch {
      /* private mode */
    }
    return () => {
      alive = false;
    };
  }, [storeSlug]);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, sending]);

  const send = useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || sending) return;
      setError(null);
      setInput("");
      setMessages((m) => [...m, { role: "user", content: msg }]);
      setSending(true);
      try {
        const res = await fetch("/api/storefront/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store: storeSlug, conversationId: convId.current, message: msg }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || "Something went wrong. Please try again.");
          setMessages((m) => m.slice(0, -1));
          setInput(msg);
          return;
        }
        convId.current = data.conversationId;
        try {
          localStorage.setItem(convKey(storeSlug), data.conversationId);
        } catch {
          /* ignore */
        }
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      } catch {
        setError("Network error. Please try again.");
        setMessages((m) => m.slice(0, -1));
        setInput(msg);
      } finally {
        setSending(false);
      }
    },
    [sending, storeSlug],
  );

  if (!boot) return null;

  const showGreeting = messages.length === 0;

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : `Chat with ${boot.name}`}
        className={`fixed right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 ${
          isImmersivePdp ? "bottom-4 hidden sm:flex" : "bottom-[84px] sm:bottom-5"
        }`}
        style={{ background: "var(--sf-accent)" }}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] flex flex-col overflow-hidden border border-[var(--sf-line)] bg-[var(--sf-bg)] text-[var(--sf-fg)] shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-24 sm:h-[560px] sm:w-[380px] sm:rounded-[var(--sf-radius-lg)]"
          style={{ maxHeight: "80vh", height: "70vh" }}
        >
          <div
            className="flex items-center gap-2 px-4 py-3 text-white"
            style={{ background: "var(--sf-accent)" }}
          >
            <Sparkles className="h-4 w-4" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{boot.name}</p>
              <p className="text-[11px] opacity-80">
                {boot.registered ? "Powered by Zotomic" : "Shopping assistant"}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {showGreeting && (
              <>
                <Bubble role="assistant">{boot.greeting}</Bubble>
                {boot.unavailable && (
                  <p className="text-center text-xs text-[var(--sf-muted)]">
                    The assistant is busy right now — replies may be limited.
                  </p>
                )}
                {boot.prompts.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {boot.prompts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => send(p)}
                        className="rounded-full border border-[var(--sf-line)] px-3 py-1.5 text-xs hover:border-[var(--sf-accent)]"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {messages.map((m, i) => (
              <Bubble key={i} role={m.role}>
                {m.role === "assistant" ? renderContent(m.content) : m.content}
              </Bubble>
            ))}

            {sending && (
              <Bubble role="assistant">
                <span className="inline-flex gap-1">
                  <Dot /> <Dot d="150ms" /> <Dot d="300ms" />
                </span>
              </Bubble>
            )}

            {error && <p className="text-center text-xs text-red-500">{error}</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-[var(--sf-line)] p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about a product or order…"
              maxLength={1000}
              className="min-w-0 flex-1 rounded-full border border-[var(--sf-line)] bg-[var(--sf-bg)] px-4 py-2 text-sm outline-none focus:border-[var(--sf-accent)]"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
              style={{ background: "var(--sf-accent)" }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
          mine ? "text-white" : "border border-[var(--sf-line)] bg-[var(--sf-card)]"
        }`}
        style={mine ? { background: "var(--sf-accent)" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function Dot({ d = "0ms" }: { d?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
      style={{ animationDelay: d }}
    />
  );
}
