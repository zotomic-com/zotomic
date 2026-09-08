"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { money } from "@/lib/money";
import type { CampaignRow, CampaignAttribution } from "@/lib/marketing";
import type { FxRate } from "@/lib/fx";
import { deleteCampaign, saveCampaign } from "./actions";

interface Row {
  campaign: CampaignRow;
  productIds: string[];
  attribution: CampaignAttribution;
}

const STATUS_TONE: Record<string, "neutral" | "primary" | "success"> = {
  planned: "neutral",
  running: "primary",
  ended: "success",
};

export function MarketingClient({
  rows,
  products,
  currency,
  fx,
}: {
  rows: Row[];
  products: { id: string; name: string }[];
  currency: string;
  fx: FxRate;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-subtle">
          USD → BDT rate: {fx.usdToBdt.toFixed(2)}
          {fx.stale ? " (offline — last known)" : ""}. Campaign spend is entered in USD.
        </p>
        <Button onClick={() => setEditing("new")} disabled={!products.length}>
          <Plus className="h-4 w-4" /> New campaign
        </Button>
      </div>
      {!products.length && <p className="text-sm text-fg-subtle">Add some products first.</p>}

      {rows.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-fg-subtle">
            No campaigns yet. Create one to see what your ad spend returned.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const a = r.attribution;
            return (
              <Card key={r.campaign.id}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>{r.campaign.name}</CardTitle>
                    <Badge tone={STATUS_TONE[r.campaign.status] ?? "neutral"}>{r.campaign.status}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <button
                      className="text-fg-subtle hover:text-danger"
                      onClick={() => {
                        if (window.confirm(`Delete "${r.campaign.name}"?`))
                          start(async () => {
                            const res = await deleteCampaign(r.campaign.id);
                            if ("error" in res) toast(res.error, "error");
                            else router.refresh();
                          });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardBody className="space-y-3">
                  <p className="text-xs text-fg-subtle">
                    {r.campaign.starts_on} → {r.campaign.ends_on} · {a.windowDays} day(s) · {a.productNames.length} product(s)
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label={a.finalised ? "Spent" : "Budget"} value={`$${a.spendUsd.toLocaleString("en-US")}`} sub={money(a.spendBdt, currency)} />
                    <Stat label="Units sold" value={a.units.toLocaleString("en-US")} />
                    <Stat label="Revenue" value={money(a.revenueBdt, currency)} />
                    <Stat
                      label="Cost / unit"
                      value={a.costPerUnitBdt != null ? money(a.costPerUnitBdt, currency) : "—"}
                      sub={a.roas != null ? `ROAS ${a.roas}×` : undefined}
                    />
                  </div>
                  <p className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-xs text-fg-subtle">
                    Counts every sale of the linked products between {r.campaign.starts_on} and {r.campaign.ends_on},
                    not only ad-driven ones. Converted at ৳{(r.campaign.fx_rate ?? fx.usdToBdt).toFixed(2)}/$.
                    {!a.finalised && " Using the budget until you enter actual spend."}
                  </p>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <CampaignForm
          key={editing === "new" ? "new" : editing.campaign.id}
          row={editing === "new" ? null : editing}
          products={products}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-sm border border-border p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="text-sm font-bold text-fg">{value}</p>
      {sub && <p className="text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

function CampaignForm({
  row,
  products,
  onClose,
  onSaved,
}: {
  row: Row | null;
  products: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const c = row?.campaign;
  const [name, setName] = useState(c?.name ?? "");
  const [budget, setBudget] = useState(String(c?.budget_usd ?? ""));
  const [spend, setSpend] = useState(c?.spend_usd == null ? "" : String(c.spend_usd));
  const [startsOn, setStartsOn] = useState(c?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(c?.ends_on ?? "");
  const [status, setStatus] = useState(c?.status ?? "planned");
  const [notes, setNotes] = useState(c?.notes ?? "");
  const [picked, setPicked] = useState<string[]>(row?.productIds ?? []);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = () =>
    start(async () => {
      const res = await saveCampaign({
        id: c?.id,
        name,
        budgetUsd: Number(budget) || 0,
        spendUsd: spend === "" ? null : Number(spend),
        startsOn,
        endsOn,
        status,
        notes,
        productIds: picked,
      });
      if ("error" in res) toast(res.error, "error");
      else onSaved();
    });

  return (
    <Modal open onClose={onClose} title={c ? "Edit campaign" : "New campaign"} size="lg">
      <div className="space-y-3">
        <Field label="Campaign name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Eid Sale — Facebook" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Budget (USD)">
            <Input type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <Field label="Actual spend (USD)" hint="Fill in after it ends">
            <Input type="number" min="0" step="0.01" value={spend} onChange={(e) => setSpend(e.target.value)} />
          </Field>
        </div>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="planned">Planned</option>
            <option value="running">Running</option>
            <option value="ended">Ended</option>
          </Select>
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium text-fg">Products in this campaign ({picked.length})</p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button onClick={submit} disabled={pending || !name || !startsOn || !endsOn} className="w-full">
          {pending ? "Saving…" : c ? "Save campaign" : "Create campaign"}
        </Button>
      </div>
    </Modal>
  );
}
