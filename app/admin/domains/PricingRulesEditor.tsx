"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { PricingRule } from "@/lib/domains/pricing-rules";
import { createPricingRuleAction, updatePricingRuleAction, deletePricingRuleAction } from "./actions";

interface TldPreview {
  tld: string;
  wholesaleUsd: number | null;
  sellingFirstYear: number | null;
  sellingRenewal: number | null;
}

export function PricingRulesEditor({
  rules,
  preview,
  globalMarkupPercent,
}: {
  rules: PricingRule[];
  preview: TldPreview[];
  globalMarkupPercent: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const ruleByTld = new Map(rules.map((r) => [r.tld, r]));

  const draftValue = (tld: string) => {
    if (drafts[tld] !== undefined) return drafts[tld];
    const rule = ruleByTld.get(tld);
    return rule?.commissionPercent != null ? String(rule.commissionPercent) : "";
  };

  const save = (tld: string) =>
    start(async () => {
      const raw = draftValue(tld).trim();
      const commissionPercent = raw === "" ? null : Number(raw);
      const rule = ruleByTld.get(tld);
      const res = rule
        ? await updatePricingRuleAction(rule.id, { commissionPercent })
        : await createPricingRuleAction({ provider: "dynadot", tld, commissionPercent, buyingPriceUsd: null });
      if (res && "error" in res) return toast(res.error, "error");
      toast("Saved", "success");
      setDrafts((d) => ({ ...d, [tld]: "" }));
      router.refresh();
    });

  const remove = (tld: string) => {
    const rule = ruleByTld.get(tld);
    if (!rule) return;
    if (!confirm(`Remove the pricing override for .${tld}? It will fall back to the global ${globalMarkupPercent}% markup.`)) return;
    start(async () => {
      await deletePricingRuleAction(rule.id);
      toast("Removed", "success");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-TLD pricing</CardTitle>
      </CardHeader>
      <CardBody className="space-y-1">
        <p className="text-sm text-fg-muted">
          Leave commission blank to use the global default ({globalMarkupPercent}%). Buying price is Dynadot&apos;s live quote — the
          same price used at checkout.
        </p>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                <th className="px-3 py-2 text-left">TLD</th>
                <th className="px-3 py-2 text-right">Buying (USD)</th>
                <th className="px-3 py-2 text-right">Commission %</th>
                <th className="px-3 py-2 text-right">Sells 1st yr</th>
                <th className="px-3 py-2 text-right">Sells renewal</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {preview.map((p) => {
                const hasRule = ruleByTld.has(p.tld);
                return (
                  <tr key={p.tld} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-fg">.{p.tld}</td>
                    <td className="px-3 py-2 text-right text-fg-muted">{p.wholesaleUsd != null ? `$${p.wholesaleUsd.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        value={draftValue(p.tld)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.tld]: e.target.value }))}
                        placeholder={String(globalMarkupPercent)}
                        className="w-20 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-fg-muted">{p.sellingFirstYear != null ? `৳${p.sellingFirstYear}` : "—"}</td>
                    <td className="px-3 py-2 text-right text-fg-muted">{p.sellingRenewal != null ? `৳${p.sellingRenewal}` : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => save(p.tld)}>
                          Save
                        </Button>
                        {hasRule && (
                          <button onClick={() => remove(p.tld)} disabled={pending} className="text-fg-subtle hover:text-danger">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
