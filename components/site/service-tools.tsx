"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHero } from "@/components/site/marketing";

export interface QuotaInfo {
  used: number;
  limit: number | null;
  remaining: number | null;
  maxQuality?: number | null;
  plan?: string;
  error?: string;
}

export interface MyToken {
  prefix: string;
  token?: string;
  label?: string | null;
  services: string;
  expiresAt?: string | null;
}

/** Centered hero + body shared by both service pages. */
export function ToolPageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return <PageHero eyebrow={eyebrow} title={title} subtitle={subtitle} />;
}

/** Signed-out state: the tools are for Zotomic users (plan-based access). */
export function AccessGate() {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <Card>
        <CardBody className="py-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-xl font-extrabold tracking-tight text-navy">Sign in to use this service</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
            Zotomic accounts get free daily access — and paid plans get much bigger limits.
            Create a free account to get started.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              Create free account
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-fg hover:border-primary"
            >
              Sign in
            </Link>
          </div>
        </CardBody>
      </Card>
    </section>
  );
}

/** Live "used / limit" counter for the caller. */
export function QuotaPanel({ quota, unit }: { quota: QuotaInfo | null; unit: string }) {
  if (!quota) return null;
  if (quota.error) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {quota.plan && <Badge tone="neutral">{quota.plan} plan</Badge>}
      {quota.limit == null ? (
        <Badge tone="success">Unlimited today</Badge>
      ) : (
        <span className="text-fg-muted">
          <span className="font-semibold text-fg">{quota.remaining}</span> of {quota.limit} {unit} left today
          {quota.used > 0 && ` · ${quota.used} used`}
        </span>
      )}
      {quota.maxQuality != null && <Badge tone="neutral">max {quota.maxQuality}p</Badge>}
    </div>
  );
}

/** Read-only list of platform-issued tokens for the signed-in user. */
export function MyTokensPanel({ email, tokens }: { email: string; tokens: MyToken[] }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  if (!tokens.length) return null;

  return (
    <Card>
      <CardBody className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-bold text-fg">
          <KeyRound className="h-4 w-4 text-primary" /> Your service tokens
        </p>
        <p className="text-xs text-fg-muted">
          Issued by Zotomic admins to <span className="font-medium text-fg">{email}</span>. Use them with the API:
          pass <code className="rounded bg-surface-2 px-1">Authorization: Bearer &lt;token&gt;</code>
        </p>
        <ul className="divide-y divide-border">
          {tokens.map((t) => (
            <li key={t.prefix} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-mono text-xs text-fg-muted">
                {revealed === t.prefix ? t.token : `${t.prefix}••••••••••••••••`}
              </span>
              <span className="flex items-center gap-2">
                {t.label && <span className="text-xs text-fg-muted">{t.label}</span>}
                <Badge tone={t.services === "both" ? "info" : "neutral"}>{t.services.replace("_", " ")}</Badge>
                {revealed === t.prefix ? (
                  <button className="text-xs text-primary hover:underline" onClick={() => setRevealed(null)}>
                    hide
                  </button>
                ) : (
                  <button className="text-xs text-primary hover:underline" onClick={() => setRevealed(t.prefix)}>
                    reveal
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
