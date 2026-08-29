"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginAction, registerAction } from "./actions";

export function AccountAuthClient({
  slug,
  basePath,
  mode,
}: {
  slug: string;
  basePath: string;
  mode: "login" | "register";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  const submit = (fd: FormData) =>
    start(async () => {
      setErr("");
      const res = mode === "login" ? await loginAction(slug, fd) : await registerAction(slug, fd);
      if ("error" in res) setErr(res.error);
      else {
        router.push(`${basePath}/account`);
        router.refresh();
      }
    });

  const input =
    "w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 py-2.5 text-sm";

  return (
    <form action={submit} className="space-y-3">
      {mode === "register" && (
        <input name="name" placeholder="Full name" required className={input} autoComplete="name" />
      )}
      <input name="email" type="email" placeholder="Email" required className={input} autoComplete="email" />
      {mode === "register" && (
        <input name="phone" placeholder="Phone" className={input} autoComplete="tel" inputMode="tel" />
      )}
      <input
        name="password"
        type="password"
        placeholder={mode === "register" ? "Password (min 8 characters)" : "Password"}
        required
        minLength={8}
        className={input}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-[var(--sf-radius)] bg-[var(--sf-accent)] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="text-center text-sm text-[var(--sf-muted)]">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href={`${basePath}/account/register`} className="font-semibold text-[var(--sf-fg)]">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href={`${basePath}/account/login`} className="font-semibold text-[var(--sf-fg)]">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
