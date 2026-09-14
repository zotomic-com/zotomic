"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { useDraggableWidget } from "./useDraggableWidget";

interface Bootstrap {
  enabled: boolean;
  name: string;
  greeting: string;
  prompts: string[];
  loggedIn: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const CONV_KEY = "zt_fd_conv";
const LOG_KEY = "zt_fd_log";
const LOG_TTL = 12 * 60 * 60 * 1000;
const LOG_MAX = 40;

function loadLog(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { at: number; messages: ChatMessage[] };
    if (!parsed?.at || Date.now() - parsed.at > LOG_TTL || !Array.isArray(parsed.messages)) {
      localStorage.removeItem(LOG_KEY);
      return [];
    }
    return parsed.messages;
  } catch {
    return [];
  }
}

function saveLog(messages: ChatMessage[]) {
  try {
    if (!messages.length) return localStorage.removeItem(LOG_KEY);
    localStorage.setItem(LOG_KEY, JSON.stringify({ at: Date.now(), messages: messages.slice(-LOG_MAX) }));
  } catch {
    /* private mode / quota */
  }
}

function renderContent(text: string) {
  const parts = text.split(/(\bhttps?:\/\/\S+|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(p)) {
      return (
        <a key={i} href={p} className="underline text-primary">
          {p.replace(/^https?:\/\//, "")}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function FrontDeskWidget() {
  const { pos, dragging, ref: dragRef, onPointerDown, onPointerMove, onPointerUp } = useDraggableWidget("zt_fd_pos");
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [open, setOpen] = useState(false);
  // Lazy initializer reads localStorage synchronously on first render, before any
  // effect runs — loading it inside a useEffect instead races with the save-on-change
  // effect below (which fires on mount too, with messages still []) and wipes the
  // just-restored history right after loading it.
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadLog());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/front-desk/assistant")
      .then((r) => r.json())
      .then((d: Bootstrap) => {
        if (alive && d?.enabled) setBoot(d);
      })
      .catch(() => undefined);
    try {
      convId.current = localStorage.getItem(CONV_KEY);
    } catch {
      /* private mode */
    }
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, sending]);

  useEffect(() => {
    saveLog(messages);
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || sending) return;
      setError(null);
      setInput("");
      setMessages((m) => [...m, { role: "user", content: msg }]);
      setSending(true);
      try {
        const res = await fetch("/api/front-desk/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: convId.current, message: msg }),
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
          localStorage.setItem(CONV_KEY, data.conversationId);
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
    [sending],
  );

  if (!boot) return null;

  const showGreeting = messages.length === 0;
  const transform = `translate(${pos.x}px, ${pos.y}px)`;

  return (
    <>
      <button
        type="button"
        ref={dragRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          if (!onPointerUp()) setOpen((o) => !o);
          e.preventDefault();
        }}
        aria-label={open ? "Close Front Desk" : "Chat with Front Desk"}
        style={{ transform, touchAction: "none" }}
        className={`fixed bottom-5 right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg ${dragging ? "cursor-grabbing shadow-xl" : "cursor-grab hover:brightness-110"}`}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <div
          style={{ transform, maxHeight: "75vh", height: "60vh" }}
          className="fixed inset-x-3 bottom-[72px] z-[60] flex flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-2xl sm:inset-x-auto sm:right-4 sm:h-[440px] sm:w-[340px]"
        >
          <div className="flex items-center gap-2 bg-primary px-3.5 py-2.5 text-primary-fg">
            <Sparkles className="h-4 w-4" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{boot.name}</p>
              <p className="text-[11px] opacity-80">Zotomic domains, hosting &amp; services</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                  convId.current = null;
                  try {
                    localStorage.removeItem(CONV_KEY);
                    localStorage.removeItem(LOG_KEY);
                  } catch {
                    /* ignore */
                  }
                }}
                className="text-[11px] font-medium underline opacity-80 hover:opacity-100"
              >
                New chat
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
            {showGreeting && (
              <>
                <Bubble role="assistant">{boot.greeting}</Bubble>
                {boot.prompts.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {boot.prompts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => send(p)}
                        className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary"
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

            {error && <p className="text-center text-xs text-danger">{error}</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-border p-2.5"
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
              placeholder="Ask about a domain or service…"
              maxLength={1000}
              className="min-w-0 flex-1 rounded-full border border-border bg-app px-3.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
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
        className={`max-w-[85%] min-w-0 whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm [overflow-wrap:anywhere] ${
          mine ? "bg-primary text-primary-fg" : "border border-border bg-surface-2"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Dot({ d = "0ms" }: { d?: string }) {
  return <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: d }} />;
}
