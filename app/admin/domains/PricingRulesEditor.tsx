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
  wholesaleRenewalUsd: number | null;
  sellingFirstYear: number | null;
  sellingRenewal: number | null;
}

export function PricingRulesEditor({
  rules,
  preview,
  globalMarkupPercentFirstYear,
  globalMarkupPercentRenewal,
}: {
  rules: PricingRule[];
  preview: TldPreview[];
  globalMarkupPercentFirstYear: number;
  globalMarkupPercentRenewal: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, { firstYear: string; renewal: string }>>({});

  const ruleByTld = new Map(rules.map((r) => [r.tld, r]));

  const draftValue = (tld: string, field: "firstYear" | "renewal") => {
    if (drafts[tld]?.[field] !== undefined) return drafts[tld][field];
    const rule = ruleByTld.get(tld);
    const val = field === "firstYear" ? rule?.commissionPercentFirstYear : rule?.commissionPercentRenewal;
    return val != null ? String(val) : "";
  };

  const setDraft = (tld: string, field: "firstYear" | "renewal", value: string) =>
    setDrafts((d) => ({ ...d, [tld]: { firstYear: d[tld]?.firstYear ?? draftValue(tld, "firstYear"), renewal: d[tld]?.renewal ?? draftValue(tld, "renewal"), [field]: value } }));

  const save = (tld: string) =>
    start(async () => {
      const firstYearRaw = draftValue(tld, "firstYear").trim();
      const renewalRaw = draftValue(tld, "renewal").trim();
      const commissionPercentFirstYear = firstYearRaw === "" ? null : Number(firstYearRaw);
      const commissionPercentRenewal = renewalRaw === "" ? null : Number(renewalRaw);
      const rule = ruleByTld.get(tld);
      const res = rule
        ? await updatePricingRuleAction(rule.id, { commissionPercentFirstYear, commissionPercentRenewal })
        : await createPricingRuleAction({ provider: "dynadot", tld, commissionPercentFirstYear, commissionPercentRenewal, buyingPriceUsd: null });
      if (res && "error" in res) return toast(res.error, "error");
      toast("Saved", "success");
      setDrafts((d) => ({ ...d, [tld]: { firstYear: "", renewal: "" } }));
      router.refresh();
    });

  const remove = (tld: string) => {
    const rule = ruleByTld.get(tld);
    if (!rule) return;
    if (!confirm(`Remove the pricing override for .${tld}? It will fall back to the global defaults.`)) return;
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
          Leave a commission blank to use the global default (first year {globalMarkupPercentFirstYear}% · renewal{" "}
          {globalMarkupPercentRenewal}%). Buying prices are Dynadot&apos;s live quotes — the same ones used at checkout. Many
          TLDs renew far above their promotional first-year price.
        </p>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                <th className="px-3 py-2 text-left">TLD</th>
                <th className="px-3 py-2 text-right">Buying 1st yr</th>
                <th className="px-3 py-2 text-right">Buying renewal</th>
                <th className="px-3 py-2 text-right">Commission 1st yr %</th>
                <th className="px-3 py-2 text-right">Commission renewal %</th>
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
                    <td className="px-3 py-2 text-right text-fg-muted">
                      {p.wholesaleRenewalUsd != null ? `$${p.wholesaleRenewalUsd.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        value={draftValue(p.tld, "firstYear")}
                        onChange={(e) => setDraft(p.tld, "firstYear", e.target.value)}
                        placeholder={String(globalMarkupPercentFirstYear)}
                        className="w-20 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        value={draftValue(p.tld, "renewal")}
                        onChange={(e) => setDraft(p.tld, "renewal", e.target.value)}
                        placeholder={String(globalMarkupPercentRenewal)}
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
