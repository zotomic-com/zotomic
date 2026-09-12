"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { PlanCard } from "@/lib/plan-cards";
import type { PlanId } from "@/lib/plans";
import {
  saveSystemPlanCardAction,
  createCustomPlanCardAction,
  updateCustomPlanCardAction,
  deleteCustomPlanCardAction,
  reorderPlanCardAction,
} from "../../actions";

interface Draft {
  name: string;
  priceBDT: number | null;
  isCustomPrice: boolean;
  tagline: string;
  badge: string;
  features: string[];
  buttonText: string;
  buttonHref: string;
  featured: boolean;
  enabled: boolean;
}

function toDraft(c: PlanCard): Draft {
  return {
    name: c.name,
    priceBDT: c.priceBDT,
    isCustomPrice: c.priceBDT === null,
    tagline: c.tagline,
    badge: c.badge,
    features: c.features,
    buttonText: c.buttonText,
    buttonHref: c.buttonHref,
    featured: c.featured,
    enabled: c.enabled,
  };
}

function CardFields({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const updateFeature = (i: number, v: string) => set("features", draft.features.map((f, j) => (j === i ? v : f)));

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Name">
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Badge (optional, e.g. Popular)">
          <Input value={draft.badge} onChange={(e) => set("badge", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Price (BDT / month)">
          <Input
            type="number"
            disabled={draft.isCustomPrice}
            value={draft.priceBDT ?? ""}
            onChange={(e) => set("priceBDT", e.target.value === "" ? 0 : Number(e.target.value))}
          />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={draft.isCustomPrice}
            onChange={(e) => onChange({ ...draft, isCustomPrice: e.target.checked, priceBDT: e.target.checked ? null : (draft.priceBDT ?? 0) })}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Show &quot;Custom&quot; instead of a price
        </label>
      </div>
      <Field label="Tagline">
        <Input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} />
      </Field>
      <div>
        <p className="mb-1 text-xs font-medium text-fg">Feature bullets</p>
        <div className="space-y-1.5">
          {draft.features.map((f, i) => (
            <div key={i} className="flex gap-1.5">
              <Input value={f} onChange={(e) => updateFeature(i, e.target.value)} />
              <button type="button" onClick={() => set("features", draft.features.filter((_, j) => j !== i))} className="shrink-0 text-fg-subtle hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <Button type="button" size="sm" variant="ghost" className="mt-1.5" onClick={() => set("features", [...draft.features, ""])}>
          <Plus className="h-3.5 w-3.5" /> Add bullet
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Button text">
          <Input value={draft.buttonText} onChange={(e) => set("buttonText", e.target.value)} />
        </Field>
        <Field label="Button link">
          <Input value={draft.buttonHref} onChange={(e) => set("buttonHref", e.target.value)} placeholder="/signup or /contact" />
        </Field>
      </div>
    </div>
  );
}

function SystemCardCard({ card, onSaved }: { card: PlanCard; onSaved: () => void }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(toDraft(card));

  const save = () =>
    start(async () => {
      await saveSystemPlanCardAction(card.id as PlanId, {
        name: draft.name,
        priceBDT: draft.isCustomPrice ? null : draft.priceBDT,
        tagline: draft.tagline,
        badge: draft.badge,
        features: draft.features.filter(Boolean),
        buttonText: draft.buttonText,
        buttonHref: draft.buttonHref,
      });
      toast("Saved — live now", "success");
      onSaved();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {card.name || card.id}
          <Lock className="h-3.5 w-3.5 text-fg-subtle" />
          {card.featured && <Badge tone="primary">Popular</Badge>}
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-xs text-fg-subtle">
          Plan ID <code className="rounded-sm bg-surface-2 px-1">{card.id}</code> — this drives real billing and feature limits, so it can&apos;t be
          deleted, but everything shown on the card is editable.
        </p>
        <CardFields draft={draft} onChange={setDraft} />
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardBody>
    </Card>
  );
}

function CustomCardCard({ card, onSaved, canMoveUp, canMoveDown }: { card: PlanCard; onSaved: () => void; canMoveUp: boolean; canMoveDown: boolean }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(toDraft(card));

  const save = () =>
    start(async () => {
      const res = await updateCustomPlanCardAction(card.id, {
        name: draft.name,
        priceBDT: draft.isCustomPrice ? null : draft.priceBDT,
        tagline: draft.tagline,
        badge: draft.badge,
        features: draft.features.filter(Boolean),
        buttonText: draft.buttonText,
        buttonHref: draft.buttonHref,
        featured: draft.featured,
      });
      if ("error" in res) return toast(res.error, "error");
      toast("Saved — live now", "success");
      onSaved();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {card.name || card.id}
          <Badge tone={card.enabled ? "success" : "neutral"}>{card.enabled ? "shown" : "hidden"}</Badge>
        </CardTitle>
        <span className="flex items-center gap-1 text-fg-subtle">
          <button onClick={() => start(async () => { await reorderPlanCardAction(card.id, "up"); onSaved(); })} disabled={pending || !canMoveUp} className="disabled:opacity-30 hover:text-fg">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button onClick={() => start(async () => { await reorderPlanCardAction(card.id, "down"); onSaved(); })} disabled={pending || !canMoveDown} className="disabled:opacity-30 hover:text-fg">
            <ArrowDown className="h-4 w-4" />
          </button>
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        <CardFields draft={draft} onChange={setDraft} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
            Highlight as popular
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={card.enabled} onChange={(e) => start(async () => { await updateCustomPlanCardAction(card.id, { enabled: e.target.checked }); onSaved(); })} className="h-4 w-4 accent-[var(--primary)]" />
            Shown on the pricing page
          </label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete the "${card.name}" card?`)) return;
              start(async () => {
                await deleteCustomPlanCardAction(card.id);
                toast("Deleted", "success");
                onSaved();
              });
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function PricingCardsEditor({ cards }: { cards: PlanCard[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const systemCards = cards.filter((c) => c.kind === "system");
  const customCards = cards.filter((c) => c.kind === "custom");
  const refresh = () => router.refresh();

  const addCard = () =>
    start(async () => {
      const id = slugify(name);
      const res = await createCustomPlanCardAction({
        id,
        name,
        priceBDT: 0,
        tagline: "",
        badge: "",
        features: [],
        buttonText: "Contact us",
        buttonHref: "/contact",
        featured: false,
      });
      if ("error" in res) return toast(res.error, "error");
      toast("Added", "success");
      setName("");
      setAdding(false);
      refresh();
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        These are the plan cards shown on the pricing page (and the mini upgrade card on the billing page).
      </p>
      {systemCards.map((c) => (
        <SystemCardCard key={c.id} card={c} onSaved={refresh} />
      ))}

      {customCards.map((c, i) => (
        <CustomCardCard key={c.id} card={c} onSaved={refresh} canMoveUp={i > 0} canMoveDown={i < customCards.length - 1} />
      ))}

      {adding ? (
        <div className="flex gap-2 rounded-lg border border-border p-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Enterprise" className="max-w-xs" />
          <Button size="sm" disabled={pending || !name.trim()} onClick={addCard}>
            Add card
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add a pricing card
        </Button>
      )}
    </div>
  );
}
