"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, ShieldAlert, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { CATEGORY_LABEL } from "@/lib/fraud/phone";
import { setStageAction, runScanAction, setStoreFraudWarnings, findStoresForFraud } from "./actions";

export interface FlagRow {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  stage: number;
  stageLabel: string;
  category: string;
  reason: string | null;
  score: number | null;
  source: string;
  ordersThisWeek: number;
  lastActivity: string;
}
export interface ExcludedStore {
  id: string;
  name: string;
}

const STAGE_TONE: Record<number, "warning" | "danger"> = { 1: "warning", 2: "warning", 3: "danger" };

export function FraudClient({
  rows,
  excludedStores,
  totalStores,
}: {
  rows: FlagRow[];
  excludedStores: ExcludedStore[];
  totalStores: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (stage && String(r.stage) !== stage) return false;
      if (t && !`${r.phone} ${r.email ?? ""} ${r.name ?? ""} ${r.reason ?? ""}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [rows, q, stage]);

  const cols: Column<FlagRow>[] = [
    {
      key: "phone",
      header: "Customer",
      render: (r) => (
        <Link href={`/admin/fraud/${r.id}`} className="group flex items-center gap-1.5">
          <span>
            <span className="block font-medium text-fg group-hover:text-primary">{r.name ?? r.phone}</span>
            <span className="block text-xs text-fg-subtle">
              {r.name ? r.phone : r.email ?? "no email"}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle group-hover:text-primary" />
        </Link>
      ),
    },
    { key: "stage", header: "Stage", render: (r) => <Badge tone={STAGE_TONE[r.stage]}>{r.stageLabel}</Badge> },
    { key: "category", header: "Reason", render: (r) => CATEGORY_LABEL[r.category] ?? r.category },
    { key: "score", header: "Score", align: "right", render: (r) => (r.score != null ? r.score : "—") },
    { key: "source", header: "Source", render: (r) => <span className="text-xs capitalize text-fg-subtle">{r.source}</span> },
    { key: "week", header: "Orders · 7d", align: "right", render: (r) => (r.ordersThisWeek || "—") },
    { key: "last", header: "Last seen", align: "right", render: (r) => r.lastActivity },
  ];

  const submitAdd = (f: FormData) =>
    start(async () => {
      const res = await setStageAction({
        phone: String(f.get("phone") ?? ""),
        name: String(f.get("name") ?? "") || undefined,
        email: String(f.get("email") ?? "") || undefined,
        stage: Number(f.get("stage") ?? 1),
        category: String(f.get("category") ?? "other"),
        reason: String(f.get("reason") ?? ""),
      });
      if ("error" in res) return toast(res.error, "error");
      setAddOpen(false);
      toast("Flag saved", "success");
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search phone, email, name, reason…"
            className="h-9 min-w-[200px] flex-1 rounded-sm border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
          />
          <Select value={stage} onChange={(e) => setStage(e.target.value)} className="max-w-[150px]">
            <option value="">All stages</option>
            <option value="1">Watch</option>
            <option value="2">Suspect</option>
            <option value="3">Blacklist</option>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await runScanAction();
                if ("error" in res) return toast(res.error, "error");
                toast(`Scan done — ${res.flagged} flagged of ${res.scanned}`, "success");
                router.refresh();
              })
            }
          >
            <RefreshCw className="h-4 w-4" /> Run scan
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Flag a customer
          </Button>
        </div>
      </Card>

      <Card>
        <DataTable columns={cols} rows={filtered} rowKey={(r) => r.id} empty={{ title: "No flags" }} />
      </Card>

      <FraudWarningStores excludedStores={excludedStores} totalStores={totalStores} />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Flag a customer">
        <form action={submitAdd} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input name="phone" placeholder="01XXXXXXXXX" required />
            </Field>
            <Field label="Name (optional)">
              <Input name="name" />
            </Field>
          </div>
          <Field label="Email (optional)">
            <Input name="email" type="email" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <Select name="stage" defaultValue="2">
                <option value="1">Watch</option>
                <option value="2">Suspect</option>
                <option value="3">Blacklist (auto-hold orders)</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select name="category" defaultValue="other">
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Reason / notes">
            <Textarea name="reason" rows={2} placeholder="Chargeback on order ZF-1234, refused 3 deliveries…" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              Save flag
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ─────────────  who receives fraud warnings (exception list)  ───────────── */

function FraudWarningStores({
  excludedStores,
  totalStores,
}: {
  excludedStores: ExcludedStore[];
  totalStores: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; enabled: boolean }[]>([]);

  const search = (term: string) => {
    setQ(term);
    if (term.trim().length < 2) return setResults([]);
    start(async () => setResults(await findStoresForFraud(term)));
  };

  const setEnabled = (id: string, enabled: boolean, name: string) =>
    start(async () => {
      const res = await setStoreFraudWarnings(id, enabled);
      if ("error" in res) return toast(res.error, "error");
      toast(enabled ? `${name} back on` : `${name} opted out`, "success");
      setResults((r) => r.map((x) => (x.id === id ? { ...x, enabled } : x)));
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-fg-subtle" /> Fraud warnings
          </span>
        </CardTitle>
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-primary">
          {open ? "Done" : "Manage exceptions"}
        </button>
      </CardHeader>

      <div className="space-y-3 px-4 py-4 text-sm">
        <p className="text-fg-muted">
          On for <span className="font-semibold text-fg">all {totalStores.toLocaleString("en-US")} stores</span>
          {excludedStores.length > 0 ? (
            <>
              {" "}
              except <span className="font-semibold text-fg">{excludedStores.length}</span>.
            </>
          ) : (
            "."
          )}
        </p>

        {excludedStores.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {excludedStores.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2">
                <span className="font-medium text-fg">{s.name}</span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEnabled(s.id, true, s.name)}>
                  Turn back on
                </Button>
              </li>
            ))}
          </ul>
        )}

        {open && (
          <div className="rounded-lg border border-dashed border-border p-3">
            <Input value={q} onChange={(e) => search(e.target.value)} placeholder="Find a store to opt out…" autoFocus />
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-border">
                {results.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <span className="text-fg">{r.name}</span>
                    {r.enabled ? (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEnabled(r.id, false, r.name)}>
                        Turn off warnings
                      </Button>
                    ) : (
                      <span className="text-xs text-fg-subtle">already off</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
