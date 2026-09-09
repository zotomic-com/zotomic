"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Globe, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { checkCustomDomain, connectCustomDomain, removeCustomDomain } from "./domain-actions";

interface Props {
  locked: boolean;
  domain: string | null;
  status: "none" | "pending" | "active";
  records: { type: string; name: string; value: string }[];
}

export function DomainSection({ locked, domain, status, records }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>, done?: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast(res.error, "error");
      else {
        if (done) toast(done, "success");
        router.refresh();
      }
    });

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-fg">Custom domain</h2>
        <Badge tone="warning">Paid plan</Badge>
      </div>
      <p className="mt-0.5 text-sm text-fg-muted">
        Serve your storefront on your own domain, e.g. <span className="font-mono">shop.yourbrand.com</span>.
      </p>

      {locked ? (
        <div className="mt-3 flex items-center gap-3 rounded border border-border bg-surface-2 p-4 text-sm">
          <Lock className="h-4 w-4 shrink-0 text-fg-subtle" />
          <span className="text-fg-muted">
            Custom domains unlock on the Business plan. Until then your store lives at{" "}
            <span className="font-mono">zotomic.com/&lt;your-store&gt;</span>.
          </span>
        </div>
      ) : !domain ? (
        <div className="mt-3 rounded border border-border bg-surface p-4">
          <p className="text-xs font-semibold text-fg-muted">Connect a domain you already own</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              className="min-w-[14rem] flex-1"
              placeholder="shop.yourbrand.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button disabled={pending || !value.trim()} onClick={() => run(() => connectCustomDomain(value), "Domain connected — add the DNS record")}>
              {pending ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3 rounded border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-mono text-sm text-fg">
              <Globe className="h-4 w-4 text-fg-subtle" />
              {domain}
            </span>
            {status === "active" ? (
              <Badge tone="success">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Live
              </Badge>
            ) : (
              <Badge tone="warning">Pending DNS</Badge>
            )}
          </div>

          {status !== "active" && (
            <div className="rounded-sm border border-border bg-surface-2 p-3 text-xs">
              <p className="font-semibold text-fg-muted">
                Add this record at your domain registrar, then click Check:
              </p>
              <table className="mt-2 w-full">
                <thead className="text-fg-subtle">
                  <tr>
                    <th className="text-left">Type</th>
                    <th className="text-left">Name</th>
                    <th className="text-left">Value</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-fg">
                  {records.map((r, i) => (
                    <tr key={i}>
                      <td className="pr-3">{r.type}</td>
                      <td className="pr-3">{r.name}</td>
                      <td className="break-all">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-fg-subtle">DNS changes can take a few minutes to a few hours.</p>

              <details className="mt-2.5 border-t border-border pt-2">
                <summary className="cursor-pointer font-semibold text-fg-muted">Using Cloudflare?</summary>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-fg-subtle">
                  <li>
                    Add the record with the proxy <span className="font-semibold text-fg">turned OFF</span> — the cloud icon
                    must be grey (&ldquo;DNS only&rdquo;), not orange. A proxied record blocks the SSL certificate.
                  </li>
                  <li>
                    Under SSL/TLS set the encryption mode to <span className="font-semibold text-fg">Full</span> (not
                    &ldquo;Flexible&rdquo; — Flexible causes a redirect loop).
                  </li>
                  <li>Cloudflare flattens CNAMEs at the root, so a root domain can use the same value as a subdomain.</li>
                </ul>
              </details>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {status !== "active" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const res = await checkCustomDomain();
                    if ("ok" in res)
                      toast(
                        res.active
                          ? "Domain is live 🎉"
                          : "Not verified yet — check the DNS record is set and (on Cloudflare) not proxied.",
                        res.active ? "success" : "info",
                      );
                    return res;
                  })
                }
              >
                {pending ? "Checking…" : "Check status"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="text-danger"
              onClick={() => {
                if (window.confirm(`Disconnect ${domain}? Your store stays available at zotomic.com/…`))
                  run(() => removeCustomDomain(), "Domain removed");
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
