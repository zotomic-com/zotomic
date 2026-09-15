"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function ResetPasswordForm() {
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
