"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

function withNext(href: string, next: string | null) {
  return next ? `${href}?next=${encodeURIComponent(next)}` : href;
}

export function LoginForm({ googleEnabled, facebookEnabled }: { googleEnabled: boolean; facebookEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const oauthError = params.get("error");
    if (oauthError) setError(oauthError);
  }, [params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        router.push(next || d.redirect || "/app");
      } else {
        setError(d.error ?? "Login failed");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {(googleEnabled || facebookEnabled) && (
        <div className="space-y-2">
          {googleEnabled && (
            <a
              href={withNext("/api/auth/google", next)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-sm border border-border-strong text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
            >
              Continue with Google
            </a>
          )}
          {facebookEnabled && (
            <a
              href={withNext("/api/auth/facebook", next)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-sm border border-border-strong text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
            >
              Continue with Facebook
            </a>
          )}
          <div className="flex items-center gap-2 text-xs text-fg-subtle">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="••••••••"
          />
        </Field>

        {error && (
          <p className="rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-xs">
          <Link href="/forgot-password" className="text-fg-subtle hover:text-fg">
            Forgot your password?
          </Link>
        </p>
      </form>
    </div>
  );
}
