"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { SITE_ICON_NAMES, siteIcon } from "@/lib/site-icons";
import type { ServiceCard, ServiceCardInput } from "@/lib/service-cards";
import {
  createServiceCardAction,
  updateServiceCardAction,
  deleteServiceCardAction,
  reorderServiceCardAction,
} from "../actions";

const EMPTY: ServiceCardInput = { title: "", description: "", icon: "Sparkles", status: "coming_soon", href: "" };

function ServiceCardFields({
  draft,
  onChange,
}: {
  draft: ServiceCardInput;
  onChange: (patch: Partial<ServiceCardInput>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Title">
        <Input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="e.g. Hosting" />
      </Field>
      <Field label="Icon">
        <Select value={draft.icon} onChange={(e) => onChange({ icon: e.target.value })}>
          {SITE_ICON_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description">
          <Textarea value={draft.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} />
        </Field>
      </div>
      <Field label="Status">
        <Select
          value={draft.status}
          onChange={(e) => onChange({ status: e.target.value as ServiceCardInput["status"] })}
        >
          <option value="live">Live</option>
          <option value="coming_soon">Coming soon</option>
        </Select>
      </Field>
      {draft.status === "live" && (
        <Field label="Link">
          <Input value={draft.href ?? ""} onChange={(e) => onChange({ href: e.target.value })} placeholder="/domains" />
        </Field>
      )}
    </div>
  );
}

function ExistingCard({ card, index, total }: { card: ServiceCard; index: number; total: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<ServiceCardInput>({
    title: card.title,
    description: card.description,
    icon: card.icon,
    status: card.status,
    href: card.href ?? "",
  });
  const Icon = siteIcon(draft.icon);

  const refresh = () => router.refresh();

  const save = () =>
    start(async () => {
      await updateServiceCardAction(card.id, draft);
      toast("Saved", "success");
      refresh();
    });

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Icon className="h-4 w-4 text-primary" />
            {card.title}
            {!card.enabled && <Badge tone="neutral">hidden</Badge>}
          </span>
          <span className="flex items-center gap-1 text-fg-subtle">
            <button
              onClick={() => start(async () => { await reorderServiceCardAction(card.id, "up"); refresh(); })}
              disabled={pending || index === 0}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => start(async () => { await reorderServiceCardAction(card.id, "down"); refresh(); })}
              disabled={pending || index === total - 1}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={card.enabled}
                onChange={(e) => start(async () => { await updateServiceCardAction(card.id, { enabled: e.target.checked }); refresh(); })}
                disabled={pending}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              shown
            </label>
            <button
              onClick={() => {
                if (!confirm(`Delete "${card.title}"?`)) return;
                start(async () => {
                  await deleteServiceCardAction(card.id);
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
        <ServiceCardFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={save}>
            Save
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function ServiceCardsEditor({ cards }: { cards: ServiceCard[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<ServiceCardInput>(EMPTY);
  const [adding, setAdding] = useState(false);

  const add = () =>
    start(async () => {
      const res = await createServiceCardAction(draft);
      if ("error" in res) return toast(res.error, "error");
      toast("Added", "success");
      setDraft(EMPTY);
      setAdding(false);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {cards.map((c, i) => (
        <ExistingCard key={c.id} card={c} index={i} total={cards.length} />
      ))}
      {cards.length === 0 && <p className="text-sm text-fg-subtle">No service cards yet.</p>}

      {adding ? (
        <Card>
          <CardBody className="space-y-3">
            <ServiceCardFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setDraft(EMPTY); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !draft.title.trim()} onClick={add}>
                Add card
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add a service card
        </Button>
      )}
    </div>
  );
}
