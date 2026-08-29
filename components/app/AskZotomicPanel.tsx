"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SUGGESTIONS = [
  "Why did my profit change this week?",
  "Which products are selling the most?",
  "Show me my top returning customers",
  "What should I focus on next week?",
];

export function AskZotomicPanel() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const ask = (text: string) => {
    router.push(`/app/assistant?q=${encodeURIComponent(text)}`);
  };

  return (
    <div className="flex h-full flex-col rounded border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold text-fg">Ask Zotomic</p>
        <Badge tone="primary">Beta</Badge>
      </div>
      <p className="mt-1 text-xs text-fg-muted">Your AI business assistant</p>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            className="rounded-sm border border-border px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:border-primary hover:bg-primary-soft hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q.trim());
        }}
        className="mt-4 flex items-center gap-2 rounded-sm border border-border bg-app px-3"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about your business…"
          className="h-9 flex-1 bg-transparent text-xs text-fg placeholder:text-fg-subtle focus:outline-none"
        />
        <button type="submit" className="text-primary" aria-label="Ask">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
