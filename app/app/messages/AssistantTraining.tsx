"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Plus, Trash2, Search, Pencil, X } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { SignalToggles } from "@/lib/storefront/assistant-signals";
import {
  saveAssistantTraining,
  addKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  setProductAssistantNote,
  searchProductsForAssistant,
} from "./actions";

interface KEntry {
  id: string;
  question: string;
  answer: string;
  enabled: boolean;
}
interface Promoted {
  id: string;
  name: string;
}
interface NotedProduct {
  id: string;
  name: string;
  note: string;
}

const SIGNAL_LABELS: { key: keyof SignalToggles; label: string; hint: string }[] = [
  { key: "bestseller", label: "Best-sellers", hint: "Top products by units sold in the last 30 days" },
  { key: "sale", label: "On sale", hint: "Products with an active discount" },
  { key: "campaign", label: "Campaign products", hint: "Items in a running Marketing campaign" },
  { key: "hot", label: "Trending / hot", hint: "Your 'hot' badge, plus recent sales spikes" },
];

export function AssistantTraining({
  persona: persona0,
  signals: signals0,
  knowledge: knowledge0,
  promoted: promoted0,
  notedProducts: noted0,
}: {
  persona: string;
  signals: SignalToggles;
  knowledge: KEntry[];
  promoted: Promoted[];
  notedProducts: NotedProduct[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { error: string }>, ok = "Saved", after?: () => void) =>
    start(async () => {
      const res = await fn();
      if ("error" in res) return toast(res.error, "error");
      toast(ok, "success");
      after?.();
      router.refresh();
    });

  /* persona */
  const [persona, setPersona] = useState(persona0);
  const personaDirty = persona !== persona0;

  /* signals */
  const [signals, setSignals] = useState<SignalToggles>(signals0);
  const toggleSignal = (k: keyof SignalToggles) => {
    const next = { ...signals, [k]: !signals[k] };
    setSignals(next);
    run(() => saveAssistantTraining({ signals: next }), "Updated");
  };

  /* promoted */
  const [promoted, setPromoted] = useState<Promoted[]>(promoted0);
  const savePromoted = (list: Promoted[]) => {
    setPromoted(list);
    run(() => saveAssistantTraining({ promotedProductIds: list.map((p) => p.id) }), "Updated");
  };

  /* knowledge add form */
  const [kq, setKq] = useState("");
  const [ka, setKa] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" /> Train your assistant
          </span>
        </CardTitle>
      </CardHeader>

      <CardBody className="space-y-6">
        {/* Persona / rules */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">Instructions &amp; tone</h3>
          <p className="text-xs text-fg-subtle">
            Tell the assistant how to behave — what to always mention, what never to promise, the tone to use.
          </p>
          <Textarea
            rows={3}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder={"Always mention our 7-day return policy.\nBe warm and brief. Never promise same-day delivery."}
          />
          {personaDirty && (
            <div className="flex justify-end">
              <Button size="sm" disabled={pending} onClick={() => run(() => saveAssistantTraining({ persona }))}>
                Save
              </Button>
            </div>
          )}
        </section>

        <div className="border-t border-border" />

        {/* Signals */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">What it can bring up</h3>
          <p className="text-xs text-fg-subtle">
            The assistant detects these live and mentions them when a shopper asks for a recommendation or an offer.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SIGNAL_LABELS.map((s) => (
              <label
                key={s.key}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={signals[s.key]}
                  onChange={() => toggleSignal(s.key)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-fg">{s.label}</span>
                  <span className="block text-xs text-fg-subtle">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Promoted products */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">Products to push ({promoted.length}/5)</h3>
          <p className="text-xs text-fg-subtle">
            The assistant actively suggests these when a shopper is browsing or asks for a recommendation.
          </p>
          <div className="flex flex-wrap gap-2">
            {promoted.map((p) => (
              <Badge key={p.id} tone="primary">
                {p.name}
                <button
                  onClick={() => savePromoted(promoted.filter((x) => x.id !== p.id))}
                  className="ml-1 opacity-70 hover:opacity-100"
                  aria-label={`Remove ${p.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {promoted.length === 0 && <span className="text-xs text-fg-subtle">None selected.</span>}
          </div>
          {promoted.length < 5 && (
            <ProductPicker
              label="Add a product"
              onPick={(p) => {
                if (!promoted.some((x) => x.id === p.id)) savePromoted([...promoted, { id: p.id, name: p.name }]);
              }}
            />
          )}
        </section>

        <div className="border-t border-border" />

        {/* Knowledge base */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">Knowledge &amp; answers ({knowledge0.length})</h3>
          <p className="text-xs text-fg-subtle">
            Question → answer pairs the assistant treats as the truth (sizing help, delivery areas, care tips, brand story).
          </p>

          <ul className="space-y-2">
            {knowledge0.map((k) => (
              <KnowledgeRow key={k.id} entry={k} run={run} pending={pending} />
            ))}
          </ul>

          <div className="rounded-lg border border-dashed border-border p-3">
            <Field label="Question / topic">
              <Input value={kq} onChange={(e) => setKq(e.target.value)} placeholder="Do you deliver to Sylhet?" />
            </Field>
            <div className="mt-2">
              <Field label="Answer">
                <Textarea
                  rows={2}
                  value={ka}
                  onChange={(e) => setKa(e.target.value)}
                  placeholder="Yes — Sylhet delivery takes 3–4 working days, ৳120."
                />
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                disabled={pending || !kq.trim() || !ka.trim()}
                onClick={() =>
                  run(
                    () => addKnowledgeEntry(kq, ka),
                    "Added",
                    () => {
                      setKq("");
                      setKa("");
                    },
                  )
                }
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Per-product notes */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">Product talking points</h3>
          <p className="text-xs text-fg-subtle">
            A note used only when the assistant talks about that one product (fit advice, what it pairs with, a warning).
          </p>

          <ul className="space-y-2">
            {noted0.map((p) => (
              <ProductNoteRow key={p.id} product={p} run={run} pending={pending} />
            ))}
          </ul>

          <ProductPicker
            label="Add a note to a product"
            renderPicked={(p, clear) => <ProductNoteEditor product={{ ...p, note: "" }} run={run} pending={pending} onDone={clear} />}
          />
        </section>
      </CardBody>
    </Card>
  );
}

/* ── knowledge row ── */
function KnowledgeRow({
  entry,
  run,
  pending,
}: {
  entry: KEntry;
  run: (fn: () => Promise<{ ok: true } | { error: string }>, ok?: string, after?: () => void) => void;
  pending: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [q, setQ] = useState(entry.question);
  const [a, setA] = useState(entry.answer);

  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      {edit ? (
        <div className="space-y-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} />
          <Textarea rows={2} value={a} onChange={(e) => setA(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => updateKnowledgeEntry(entry.id, { question: q, answer: a }), "Saved", () => setEdit(false))}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className={`min-w-0 ${entry.enabled ? "" : "opacity-50"}`}>
            <p className="font-medium text-fg">{entry.question}</p>
            <p className="text-fg-muted">{entry.answer}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-fg-subtle">
              <input
                type="checkbox"
                checked={entry.enabled}
                onChange={(e) => run(() => updateKnowledgeEntry(entry.id, { enabled: e.target.checked }), "Updated")}
              />
              on
            </label>
            <button onClick={() => setEdit(true)} className="text-fg-subtle hover:text-fg" aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (confirm("Delete this entry?")) run(() => deleteKnowledgeEntry(entry.id), "Deleted");
              }}
              className="text-fg-subtle hover:text-danger"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ── product note row (existing) ── */
function ProductNoteRow({
  product,
  run,
  pending,
}: {
  product: NotedProduct;
  run: (fn: () => Promise<{ ok: true } | { error: string }>, ok?: string, after?: () => void) => void;
  pending: boolean;
}) {
  const [edit, setEdit] = useState(false);
  if (edit) return <ProductNoteEditor product={product} run={run} pending={pending} onDone={() => setEdit(false)} />;
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-fg">{product.name}</p>
        <p className="text-fg-muted">{product.note}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={() => setEdit(true)} className="text-fg-subtle hover:text-fg" aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            if (confirm("Remove this note?")) run(() => setProductAssistantNote(product.id, ""), "Removed");
          }}
          className="text-fg-subtle hover:text-danger"
          aria-label="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function ProductNoteEditor({
  product,
  run,
  pending,
  onDone,
}: {
  product: { id: string; name: string; note: string };
  run: (fn: () => Promise<{ ok: true } | { error: string }>, ok?: string, after?: () => void) => void;
  pending: boolean;
  onDone: () => void;
}) {
  const [note, setNote] = useState(product.note);
  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <p className="mb-1.5 font-medium text-fg">{product.name}</p>
      <Textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Runs small — suggest sizing up. Pairs well with the Classic Cap."
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={pending || !note.trim()}
          onClick={() => run(() => setProductAssistantNote(product.id, note), "Saved", onDone)}
        >
          Save note
        </Button>
      </div>
    </li>
  );
}

/* ── product search / picker ── */
function ProductPicker({
  label,
  onPick,
  renderPicked,
}: {
  label: string;
  onPick?: (p: { id: string; name: string }) => void;
  renderPicked?: (p: { id: string; name: string }, clear: () => void) => React.ReactNode;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [busy, start] = useTransition();

  const search = () =>
    start(async () => {
      try {
        const rows = await searchProductsForAssistant(q);
        setResults(rows.map((r) => ({ id: r.id, name: r.name })));
      } catch {
        toast("Search failed", "error");
      }
    });

  if (picked && renderPicked)
    return (
      <>
        {renderPicked(picked, () => {
          setPicked(null);
          setOpen(false);
          setQ("");
          setResults([]);
        })}
      </>
    );

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {label}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
          placeholder="Product name…"
          autoFocus
        />
        <Button size="sm" variant="secondary" disabled={busy} onClick={search}>
          <Search className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {results.map((r) => (
            <li key={r.id}>
              <button
                className="w-full py-2 text-left text-sm hover:text-primary"
                onClick={() => {
                  if (renderPicked) setPicked(r);
                  else {
                    onPick?.(r);
                    setOpen(false);
                    setQ("");
                    setResults([]);
                  }
                }}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
