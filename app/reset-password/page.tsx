"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setError("Passwords don't match.");
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: pw }),
    });
    const d = await res.json();
    if (res.ok && d.ok) {
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } else {
      setError(d.error ?? "Something went wrong.");
    }
    setBusy(false);
  };

  if (!token) return <p className="text-sm text-danger">Missing reset token.</p>;
  if (done) return <p className="text-sm text-fg-muted">Password updated. Redirecting to sign in…</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="New password" hint="At least 8 characters.">
        <Input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="Confirm password">
        <Input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <div className="card p-6">
          <h1 className="mb-4 text-lg font-extrabold text-fg">Choose a new password</h1>
          <Suspense fallback={null}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
