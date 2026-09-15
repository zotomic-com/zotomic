"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { WebDevPricingPackage, WebDevPricingPackageInput } from "@/lib/webdev-pricing";
import {
  createWebDevPricingPackageAction,
  updateWebDevPricingPackageAction,
  deleteWebDevPricingPackageAction,
  reorderWebDevPricingPackageAction,
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
}

function toDraft(p: WebDevPricingPackage): Draft {
  return {
    name: p.name,
    priceBDT: p.priceBDT,
    isCustomPrice: p.priceBDT === null,
    tagline: p.tagline,
    badge: p.badge,
    features: p.features,
    buttonText: p.buttonText,
    buttonHref: p.buttonHref,
    featured: p.featured,
  };
}

const EMPTY_DRAFT: Draft = {
  name: "",
  priceBDT: 0,
  isCustomPrice: false,
  tagline: "",
  badge: "",
  features: [],
  buttonText: "Get a quote",
  buttonHref: "/web-development#inquiry",
  featured: false,
};

function PackageFields({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const updateFeature = (i: number, v: string) => set("features", draft.features.map((f, j) => (j === i ? v : f)));

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Name">
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Starter" />
        </Field>
        <Field label="Badge (optional, e.g. Popular)">
          <Input value={draft.badge} onChange={(e) => set("badge", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Price (BDT)">
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
        <Input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Who this package is for" />
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
          <Input value={draft.buttonHref} onChange={(e) => set("buttonHref", e.target.value)} placeholder="/web-development#inquiry" />
        </Field>
      </div>
    </div>
  );
}

function ExistingPackageCard({ pkg, index, total }: { pkg: WebDevPricingPackage; index: number; total: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(toDraft(pkg));
  const refresh = () => router.refresh();

  const save = () =>
    start(async () => {
      await updateWebDevPricingPackageAction(pkg.id, {
        name: draft.name,
        priceBDT: draft.isCustomPrice ? null : draft.priceBDT,
        tagline: draft.tagline,
        badge: draft.badge,
        features: draft.features.filter(Boolean),
        buttonText: draft.buttonText,
        buttonHref: draft.buttonHref,
        featured: draft.featured,
      });
      toast("Saved", "success");
      refresh();
    });

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">
            {pkg.name || "Untitled package"}
            <Badge tone={pkg.enabled ? "success" : "neutral"}>{pkg.enabled ? "shown" : "hidden"}</Badge>
          </span>
          <span className="flex items-center gap-1 text-fg-subtle">
            <button
              onClick={() => start(async () => { await reorderWebDevPricingPackageAction(pkg.id, "up"); refresh(); })}
              disabled={pending || index === 0}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => start(async () => { await reorderWebDevPricingPackageAction(pkg.id, "down"); refresh(); })}
              disabled={pending || index === total - 1}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (!confirm(`Delete "${pkg.name}"?`)) return;
                start(async () => {
                  await deleteWebDevPricingPackageAction(pkg.id);
                  toast("Deleted", "success");
                  refresh();
                });
              }}
              disabled={pending}
              className="hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        </div>
        <PackageFields draft={draft} onChange={setDraft} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
            Highlight as most popular
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={pkg.enabled}
              onChange={(e) => start(async () => { await updateWebDevPricingPackageAction(pkg.id, { enabled: e.target.checked }); refresh(); })}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Shown on the page
          </label>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={save}>
            Save
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function WebDevPricingEditor({ packages }: { packages: WebDevPricingPackage[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);

  const add = () =>
    start(async () => {
      if (!draft.name.trim()) return toast("Name is required.", "error");
      await createWebDevPricingPackageAction({
        name: draft.name,
        priceBDT: draft.isCustomPrice ? null : draft.priceBDT,
        tagline: draft.tagline,
        badge: draft.badge,
        features: draft.features.filter(Boolean),
        buttonText: draft.buttonText,
        buttonHref: draft.buttonHref,
        featured: draft.featured,
      });
      toast("Added", "success");
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {packages.map((p, i) => (
        <ExistingPackageCard key={p.id} pkg={p} index={i} total={packages.length} />
      ))}
      {packages.length === 0 && <p className="text-sm text-fg-subtle">No pricing packages yet.</p>}

      {adding ? (
        <Card>
          <CardBody className="space-y-3">
            <PackageFields draft={draft} onChange={setDraft} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !draft.name.trim()} onClick={add}>
                Add package
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add a pricing package
        </Button>
      )}
    </div>
  );
}
