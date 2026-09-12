"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { SITE_ICON_NAMES, siteIcon } from "@/lib/site-icons";
import type { PageItem, StructuralContent, StructuralSlug } from "@/lib/site-content";
import { saveStructuralPageAction } from "../../actions";

function ItemsEditor({
  label,
  hint,
  sectionTitle,
  onSectionTitleChange,
  items,
  onChange,
  withIcon = true,
}: {
  label: string;
  hint?: string;
  sectionTitle: string;
  onSectionTitleChange: (v: string) => void;
  items: PageItem[];
  onChange: (items: PageItem[]) => void;
  withIcon?: boolean;
}) {
  const update = (i: number, patch: Partial<PageItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
        <Field label="Block heading (optional)">
          <Input value={sectionTitle} onChange={(e) => onSectionTitleChange(e.target.value)} placeholder="e.g. What it can do" />
        </Field>
        <div className="space-y-3">
          {items.map((it, i) => {
            const Icon = siteIcon(it.icon);
            return (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-subtle">
                    <Icon className="h-3.5 w-3.5 text-primary" /> Item {i + 1}
                  </span>
                  <span className="flex items-center gap-1 text-fg-subtle">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30 hover:text-fg">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="disabled:opacity-30 hover:text-fg">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <div className={withIcon ? "grid gap-2 sm:grid-cols-[100px_1fr]" : ""}>
                  {withIcon && (
                    <Field label="Icon">
                      <Select value={it.icon} onChange={(e) => update(i, { icon: e.target.value })}>
                        {SITE_ICON_NAMES.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label="Title (optional)">
                    <Input value={it.title} onChange={(e) => update(i, { title: e.target.value })} />
                  </Field>
                </div>
                <Field label="Text">
                  <Textarea value={it.text} onChange={(e) => update(i, { text: e.target.value })} rows={2} />
                </Field>
              </div>
            );
          })}
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...items, { icon: "Sparkles", title: "", text: "" }])}>
          <Plus className="h-4 w-4" /> Add item
        </Button>
      </CardBody>
    </Card>
  );
}

export function StructuralPageEditor({ slug, initial }: { slug: StructuralSlug; initial: StructuralContent }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [c, setC] = useState<StructuralContent>(initial);

  const set = <K extends keyof StructuralContent>(key: K, value: StructuralContent[K]) => setC((prev) => ({ ...prev, [key]: value }));

  const save = () =>
    start(async () => {
      const res = await saveStructuralPageAction(slug, c);
      if ("error" in res) return toast((res as { error: string }).error, "error");
      toast("Saved — live now", "success");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Hero</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Badge / eyebrow text">
            <Input value={c.badge} onChange={(e) => set("badge", e.target.value)} />
          </Field>
          <Field label="Headline">
            <Input value={c.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Highlight within the headline (optional — colored in primary green)">
            <Input value={c.titleHighlight} onChange={(e) => set("titleHighlight", e.target.value)} placeholder="a word or phrase from the headline above" />
          </Field>
          <Field label="Subtitle">
            <Textarea value={c.subtitle} onChange={(e) => set("subtitle", e.target.value)} rows={2} />
          </Field>
        </CardBody>
      </Card>

      <ItemsEditor
        label="Main content block"
        hint="Feature cards, steps, FAQ entries, or a checklist — depending on this page's layout."
        sectionTitle={c.itemsTitle}
        onSectionTitleChange={(v) => set("itemsTitle", v)}
        items={c.items}
        onChange={(items) => set("items", items)}
      />

      <ItemsEditor
        label="Secondary content block (optional)"
        sectionTitle={c.items2Title}
        onSectionTitleChange={(v) => set("items2Title", v)}
        items={c.items2}
        onChange={(items) => set("items2", items)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Extra paragraph (optional)</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Heading">
            <Input value={c.bodyTitle} onChange={(e) => set("bodyTitle", e.target.value)} />
          </Field>
          <Field label="Text">
            <Textarea value={c.body} onChange={(e) => set("body", e.target.value)} rows={3} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bottom call-to-action</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={c.ctaEnabled} onChange={(e) => set("ctaEnabled", e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Show the &quot;Start free&quot; banner at the bottom of this page
          </label>
          {c.ctaEnabled && (
            <>
              <Field label="Title (optional — leave blank for the default)">
                <Input value={c.ctaTitle} onChange={(e) => set("ctaTitle", e.target.value)} placeholder="Ready to see your business clearly?" />
              </Field>
              <Field label="Subtitle (optional)">
                <Input value={c.ctaSubtitle} onChange={(e) => set("ctaSubtitle", e.target.value)} placeholder="Start free — no credit card required." />
              </Field>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SEO</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Page title (browser tab / search results)">
            <Input value={c.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} />
          </Field>
          <Field label="Meta description">
            <Textarea value={c.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} rows={2} />
          </Field>
        </CardBody>
      </Card>

      <Button disabled={pending} onClick={save}>
        {pending ? "Saving…" : "Save & publish"}
      </Button>
    </div>
  );
}
