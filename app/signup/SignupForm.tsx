"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

function withNext(href: string, next: string | null) {
  return next ? `${href}?next=${encodeURIComponent(next)}` : href;
}

export function SignupForm({ googleEnabled, facebookEnabled }: { googleEnabled: boolean; facebookEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
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
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        router.push(next || d.redirect || "/onboarding");
      } else {
        setError(d.error ?? "Signup failed");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <Link href="/" className="mb-8 flex justify-center">
        <Logo />
      </Link>
      <div className="card p-6">
        <h1 className="text-lg font-extrabold text-fg">Create your account</h1>
        <p className="mb-6 mt-1 text-sm text-fg-muted">Free to start. No credit card required.</p>

        {(googleEnabled || facebookEnabled) && (
          <div className="mb-4 space-y-2">
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
          <Field label="Full name">
            <Input
              required
              autoComplete="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ahmed Rahman"
            />
          </Field>
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
          <Field label="Phone number">
            <Input
              required
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="01XXXXXXXXX"
            />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <Input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
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
            {loading ? "Creating account…" : "Create free account"}
          </Button>
          <p className="text-center text-xs text-fg-subtle">
            By signing up you agree to our{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            &{" "}
            <Link href="/privacy-policy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </div>
      <p className="mt-4 text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary">
          Sign in
        </Link>
      </p>
    </div>
  );
}
