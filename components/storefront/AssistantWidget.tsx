"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Sparkles, ArrowRight } from "lucide-react";

interface Bootstrap {
  enabled: boolean;
  name: string;
  greeting: string;
  prompts: string[];
  registered: boolean;
  unavailable: boolean;
}

interface ProductCard {
  name: string;
  handle: string;
  url: string;
  image: string | null;
  price: string;
  stock: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  products?: ProductCard[];
  list?: { label: string; url: string } | null;
}

const convKey = (slug: string) => `zt_sf_chat_conv_${slug}`;
const logKey = (slug: string) => `zt_sf_chat_log_${slug}`;
const LOG_TTL = 12 * 60 * 60 * 1000; // keep the on-device chat for 12h
const LOG_MAX = 40;

function loadLog(slug: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(logKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { at: number; messages: ChatMessage[] };
    if (!parsed?.at || Date.now() - parsed.at > LOG_TTL || !Array.isArray(parsed.messages)) {
      localStorage.removeItem(logKey(slug));
      return [];
    }
    return parsed.messages;
  } catch {
    return [];
  }
}

function saveLog(slug: string, messages: ChatMessage[]) {
  try {
    if (!messages.length) return localStorage.removeItem(logKey(slug));
    localStorage.setItem(
      logKey(slug),
      JSON.stringify({ at: Date.now(), messages: messages.slice(-LOG_MAX) }),
    );
  } catch {
    /* private mode / quota */
  }
}

/** Strip any stray product markdown link the model still emits (cards replace it),
 *  then render **bold** and non-product links. */
function renderContent(text: string) {
  const cleaned = text
    .replace(/\[([^\]]+)\]\((?:https?:\/\/[^)]+)?\/[^)]*products\/[^)]+\)/g, "$1")
    .replace(/\(?\/[A-Za-z0-9/_-]*products\/[A-Za-z0-9_-]+\)?/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  const parts = cleaned.split(/(\bhttps?:\/\/\S+|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(p)) {
      return (
        <a key={i} href={p} className="underline" style={{ color: "var(--sf-accent)" }}>
          {p.replace(/^https?:\/\//, "")}
        </a>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function ProductCards({ products, list }: { products: ProductCard[]; list?: { label: string; url: string } | null }) {
  return (
    <div className="mt-2 space-y-2">
      {products.map((p) => (
        <a
          key={p.handle}
          href={p.url}
          className="flex items-center gap-3 rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] p-2 transition-colors hover:border-[var(--sf-accent)]"
        >
          <span className="h-14 w-14 shrink-0 overflow-hidden rounded-[calc(var(--sf-radius)-2px)] bg-[var(--sf-card)]">
            {p.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={p.image} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-[var(--sf-fg)]">{p.name}</span>
            <span className="block text-sm text-[var(--sf-fg)]">{p.price}</span>
            {p.stock && p.stock !== "in stock" && (
              <span className="block text-xs text-[var(--sf-muted)]">{p.stock}</span>
            )}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--sf-muted)]" />
        </a>
      ))}
      {list && (
        <a
          href={list.url}
          className="flex items-center justify-center gap-1.5 rounded-[var(--sf-radius)] border border-[var(--sf-line)] py-2 text-xs font-medium text-[var(--sf-fg)] hover:border-[var(--sf-accent)]"
        >
          {list.label} <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
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
    const cached = loadLog(storeSlug);
    if (cached.length) setMessages(cached);
    return () => {
      alive = false;
    };
  }, [storeSlug]);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, sending]);

  // Cache the conversation on the visitor's device so it survives reloads / navigation.
  useEffect(() => {
    saveLog(storeSlug, messages);
  }, [storeSlug, messages]);

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
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.reply, products: data.products ?? [], list: data.list ?? null },
        ]);
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
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                  convId.current = null;
                  try {
                    localStorage.removeItem(convKey(storeSlug));
                    localStorage.removeItem(logKey(storeSlug));
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
              <div key={i}>
                <Bubble role={m.role}>
                  {m.role === "assistant" ? renderContent(m.content) : m.content}
                </Bubble>
                {m.role === "assistant" && m.products && m.products.length > 0 && (
                  <ProductCards products={m.products} list={m.list} />
                )}
              </div>
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
