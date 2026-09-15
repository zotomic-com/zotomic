"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ImageUploader } from "@/components/app/ImageUploader";
import type { PortfolioItem, PortfolioItemInput } from "@/lib/portfolio";
import {
  createPortfolioItemAction,
  updatePortfolioItemAction,
  deletePortfolioItemAction,
  reorderPortfolioItemAction,
} from "../../actions";

const EMPTY: PortfolioItemInput = { title: "", description: "", imageUrl: "", projectUrl: "" };

function ItemFields({ draft, onChange }: { draft: PortfolioItemInput; onChange: (patch: Partial<PortfolioItemInput>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <ImageUploader
          value={draft.imageUrl ? [draft.imageUrl] : []}
          onChange={(urls) => onChange({ imageUrl: urls[urls.length - 1] ?? "" })}
          max={1}
          compact
          signEndpoint="/api/admin/media/sign"
          recordMetadata={false}
        />
        <p className="text-xs text-fg-subtle">Project image</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <Input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="e.g. Rahman Fashion" />
        </Field>
        <Field label="Live link (optional)">
          <Input value={draft.projectUrl ?? ""} onChange={(e) => onChange({ projectUrl: e.target.value })} placeholder="https://..." />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={draft.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} placeholder="What you built for them." />
      </Field>
    </div>
  );
}

function ExistingCard({ item, index, total }: { item: PortfolioItem; index: number; total: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<PortfolioItemInput>({
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl,
    projectUrl: item.projectUrl ?? "",
  });
  const refresh = () => router.refresh();

  const save = () =>
    start(async () => {
      await updatePortfolioItemAction(item.id, draft);
      toast("Saved", "success");
      refresh();
    });

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-fg">{item.title || "Untitled project"}</span>
          <span className="flex items-center gap-1 text-fg-subtle">
            <button
              onClick={() => start(async () => { await reorderPortfolioItemAction(item.id, "up"); refresh(); })}
              disabled={pending || index === 0}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => start(async () => { await reorderPortfolioItemAction(item.id, "down"); refresh(); })}
              disabled={pending || index === total - 1}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (!confirm(`Delete "${item.title}"?`)) return;
                start(async () => {
                  await deletePortfolioItemAction(item.id);
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
        <ItemFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={save}>
            Save
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function PortfolioEditor({ items }: { items: PortfolioItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<PortfolioItemInput>(EMPTY);
  const [adding, setAdding] = useState(false);

  const add = () =>
    start(async () => {
      if (!draft.imageUrl) return toast("Upload a project image first.", "error");
      const res = await createPortfolioItemAction(draft);
      if ("error" in res) return toast(res.error, "error");
      toast("Added", "success");
      setDraft(EMPTY);
      setAdding(false);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <ExistingCard key={it.id} item={it} index={i} total={items.length} />
      ))}
      {items.length === 0 && <p className="text-sm text-fg-subtle">No portfolio items yet.</p>}

      {adding ? (
        <Card>
          <CardBody className="space-y-3">
            <ItemFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setDraft(EMPTY); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !draft.title.trim()} onClick={add}>
                Add project
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add a project
        </Button>
      )}
    </div>
  );
}
