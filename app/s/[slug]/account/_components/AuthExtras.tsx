"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { requestPasswordResetAction, resetPasswordAction } from "../actions";

const input =
  "w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--sf-accent)]";
const primary = "w-full rounded-[var(--sf-radius)] bg-[var(--sf-accent)] py-2.5 text-sm font-semibold text-white disabled:opacity-60";

export function ForgotForm({ slug, basePath }: { slug: string; basePath: string }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded-[var(--sf-radius)] bg-[var(--sf-accent-soft)] p-3 text-[var(--sf-fg)]">
          If an account exists for that email, we&apos;ve sent a reset link. It works for 45 minutes.
        </p>
        <Link href={`${basePath}/account/login`} className="font-semibold text-[var(--sf-accent)]">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      action={(fd) =>
        start(async () => {
          await requestPasswordResetAction(slug, String(fd.get("email") ?? ""));
          setSent(true);
        })
      }
      className="space-y-3"
    >
      <input name="email" type="email" required placeholder="Your email" autoComplete="email" className={input} />
      <button disabled={pending} className={primary}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm text-[var(--sf-muted)]">
        <Link href={`${basePath}/account/login`} className="font-semibold text-[var(--sf-fg)]">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetForm({ slug, basePath, token }: { slug: string; basePath: string; token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  if (!token) {
    return <p className="text-sm text-red-600">This reset link is missing its token.</p>;
  }

  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <p className="rounded-[var(--sf-radius)] bg-[var(--sf-accent-soft)] p-3">Your password has been reset.</p>
        <Link href={`${basePath}/account/login`} className="font-semibold text-[var(--sf-accent)]">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      action={(fd) =>
        start(async () => {
          setErr("");
          const pw = String(fd.get("password") ?? "");
          if (pw !== String(fd.get("confirm") ?? "")) {
            setErr("The two passwords don't match.");
            return;
          }
          const res = await resetPasswordAction(slug, token, pw);
          if ("error" in res) setErr(res.error);
          else {
            setDone(true);
            setTimeout(() => router.push(`${basePath}/account/login`), 2500);
          }
        })
      }
      className="space-y-3"
    >
      <input name="password" type="password" required minLength={8} placeholder="New password (min 8)" autoComplete="new-password" className={input} />
      <input name="confirm" type="password" required minLength={8} placeholder="Confirm new password" autoComplete="new-password" className={input} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button disabled={pending} className={primary}>
        {pending ? "Saving…" : "Reset password"}
      </button>
    </form>
  );
}
