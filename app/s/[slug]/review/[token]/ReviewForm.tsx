"use client";

import { useState } from "react";
import { Star } from "lucide-react";

export function ReviewForm({ token, productName }: { token: string; productName: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [form, setForm] = useState({ name: "", title: "", body: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  if (status === "done") {
    return (
      <div className="py-12 text-center">
        <p className="text-lg font-extrabold">Thanks for the review</p>
        <p className="mt-1 text-sm text-[var(--sf-muted)]">
          It&apos;ll appear on the store once the shop owner approves it.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setError("Please pick a star rating.");
      return;
    }
    setStatus("sending");
    setError("");
    const res = await fetch("/api/storefront/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, rating, ...form }),
    });
    const d = await res.json();
    if (res.ok && d.ok) setStatus("done");
    else {
      setError(d.error ?? "Something went wrong.");
      setStatus("error");
    }
  };

  const field = "h-10 w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 text-sm";

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-[var(--sf-muted)]">How was your {productName}?</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n} star`}
          >
            <Star
              className="h-7 w-7"
              fill={(hover || rating) >= n ? "var(--sf-accent)" : "none"}
              stroke="var(--sf-accent)"
            />
          </button>
        ))}
      </div>
      <input placeholder="Your name (optional)" className={field} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      <input placeholder="Headline (optional)" className={field} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      <textarea placeholder="Tell others about it (optional)" rows={4} className={`${field} h-auto py-2`} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {status === "sending" ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
