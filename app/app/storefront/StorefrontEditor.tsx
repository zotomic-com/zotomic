"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Copy, ExternalLink, Eye, Plus, Trash2 } from "lucide-react";
import {
  SECTION_LABELS,
  STORE_PAGE_LABELS,
  defaultSection,
  type Section,
  type SectionType,
  type StorefrontConfig,
} from "@/lib/storefront/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { publishStorefront, saveDraft, unpublishStorefront } from "./actions";
import { SECTION_FIELDS } from "./section-fields";

const ALL_SECTIONS = Object.keys(SECTION_LABELS) as SectionType[];

export function StorefrontEditor({
  initialConfig,
  published,
  storeUrl,
  subdomainUrl,
}: {
  initialConfig: StorefrontConfig;
  published: boolean;
  storeUrl: string | null;
  subdomainUrl?: string | null;
}) {
  const { toast } = useToast();
  const [config, setConfig] = useState<StorefrontConfig>(initialConfig);
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();
  const [publishing, startPublish] = useTransition();
  const [previewKey, setPreviewKey] = useState(0);
  const [tab, setTab] = useState<"content" | "design" | "pages" | "settings">("content");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((fn: (c: StorefrontConfig) => StorefrontConfig) => {
    setConfig((c) => fn(structuredClone(c)));
    setDirty(true);
  }, []);

  const doSave = useCallback(
    (silent = false) =>
      startSave(async () => {
        const res = await saveDraft(config);
        if (res.error) toast(res.error, "error");
        else {
          setDirty(false);
          setPreviewKey((k) => k + 1);
          if (!silent) toast("Draft saved", "success");
        }
      }),
    [config, toast],
  );

  // debounced autosave
  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(true), 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, dirty]);

  const publish = () =>
    startPublish(async () => {
      const res = await publishStorefront();
      if (res.error) toast(res.error, "error");
      else toast("Storefront published", "success");
    });

  const unpublish = () =>
    startPublish(async () => {
      const res = await unpublishStorefront();
      if (res.error) toast(res.error, "error");
      else toast("Storefront unpublished", "info");
    });

  // ── section ops ──
  const moveSection = (i: number, dir: -1 | 1) =>
    update((c) => {
      const j = i + dir;
      if (j < 0 || j >= c.sections.length) return c;
      [c.sections[i], c.sections[j]] = [c.sections[j], c.sections[i]];
      return c;
    });
  const toggleSection = (i: number) =>
    update((c) => ((c.sections[i].enabled = !c.sections[i].enabled), c));
  const deleteSection = (i: number) => update((c) => ((c.sections.splice(i, 1), c)));
  const addSection = (t: SectionType) => update((c) => ((c.sections.push(defaultSection(t)), c)));
  const setSectionField = (i: number, key: string, val: unknown) =>
    update((c) => ((c.sections[i].data[key] = val), c));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* ── editor panel ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 rounded border border-border bg-surface p-3">
          <div className="flex items-center gap-2 text-xs">
            {published ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Draft</Badge>}
            {saving ? <span className="text-fg-subtle">Saving…</span> : dirty ? <span className="text-warning">Unsaved</span> : <span className="text-fg-subtle">Saved</span>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => doSave()} disabled={saving || !dirty}>
              Save
            </Button>
            <Button size="sm" onClick={publish} disabled={publishing}>
              {publishing ? "Publishing…" : published ? "Republish" : "Publish"}
            </Button>
          </div>
        </div>

        {published && storeUrl && (
          <div className="rounded border border-border bg-surface p-3 text-xs">
            <p className="font-semibold text-fg-muted">Your store is live at</p>
            <div className="mt-1 flex items-center gap-2">
              <a href={storeUrl} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-primary">
                {storeUrl}
              </a>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(storeUrl);
                  toast("Link copied", "info");
                }}
                className="text-fg-subtle hover:text-fg"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <a href={storeUrl} target="_blank" rel="noreferrer" className="text-fg-subtle hover:text-fg">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {subdomainUrl && (
              <p className="mt-1.5 text-fg-subtle">
                A dedicated address (<span className="font-medium">{subdomainUrl.replace("https://", "")}</span>) can be
                enabled later.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-1 rounded border border-border bg-surface-2 p-1 text-sm">
          {(["content", "design", "pages", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-[8px] px-3 py-1.5 font-medium capitalize ${
                tab === t ? "bg-surface text-fg shadow-sm" : "text-fg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "design" && (
          <Panel title="Brand">
            <TextRow label="Store name" value={config.brand.storeName} onChange={(v) => update((c) => ((c.brand.storeName = v), c))} />
            <TextRow label="Tagline" value={config.brand.tagline} onChange={(v) => update((c) => ((c.brand.tagline = v), c))} />
            <TextRow label="Logo URL" value={config.brand.logoUrl ?? ""} onChange={(v) => update((c) => ((c.brand.logoUrl = v || null), c))} />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-fg">
                Accent colour
                <input type="color" value={config.brand.accent} onChange={(e) => update((c) => ((c.brand.accent = e.target.value), c))} className="mt-1 h-9 w-full rounded-sm border border-border" />
              </label>
              <SelectRow label="Theme" value={config.brand.theme} options={["light", "dark"]} onChange={(v) => update((c) => ((c.brand.theme = v as "light" | "dark"), c))} />
              <SelectRow label="Font" value={config.brand.font} options={["inter", "manrope", "lora", "poppins"]} onChange={(v) => update((c) => ((c.brand.font = v as StorefrontConfig["brand"]["font"]), c))} />
              <SelectRow label="Corners" value={config.brand.radius} options={["sharp", "soft", "round"]} onChange={(v) => update((c) => ((c.brand.radius = v as StorefrontConfig["brand"]["radius"]), c))} />
            </div>
          </Panel>
        )}

        {tab === "content" && (
          <>
            <Panel title="Announcement bar">
              <BoolRow label="Show announcement" value={config.announcement.enabled} onChange={(v) => update((c) => ((c.announcement.enabled = v), c))} />
              <TextRow label="Text" value={config.announcement.text} onChange={(v) => update((c) => ((c.announcement.text = v), c))} />
              <TextRow label="Link (optional)" value={config.announcement.href} onChange={(v) => update((c) => ((c.announcement.href = v), c))} />
            </Panel>

            <Panel title="Sections">
              <div className="space-y-2">
                {config.sections.map((s, i) => (
                  <SectionCard
                    key={s.id}
                    section={s}
                    onUp={() => moveSection(i, -1)}
                    onDown={() => moveSection(i, 1)}
                    onToggle={() => toggleSection(i)}
                    onDelete={() => deleteSection(i)}
                    onField={(k, v) => setSectionField(i, k, v)}
                  />
                ))}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-primary">
                  <Plus className="mr-1 inline h-3.5 w-3.5" /> Add section
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {ALL_SECTIONS.map((t) => (
                    <button
                      key={t}
                      onClick={() => addSection(t)}
                      className="rounded-sm border border-border px-2 py-1.5 text-left text-xs hover:border-primary hover:bg-primary-soft"
                    >
                      {SECTION_LABELS[t]}
                    </button>
                  ))}
                </div>
              </details>
            </Panel>
          </>
        )}

        {tab === "pages" && (
          <>
            <p className="text-xs text-fg-subtle">
              These pages appear in your storefront footer. Leave a page hidden to remove its footer link.
              Separate paragraphs with a blank line.
            </p>

            <Panel title="About page">
              <BoolRow label="Show About page" value={config.pages.about.enabled} onChange={(v) => update((c) => ((c.pages.about.enabled = v), c))} />
              <TextRow label="Title" value={config.pages.about.title} onChange={(v) => update((c) => ((c.pages.about.title = v), c))} />
              <TextareaRow label="Body" value={config.pages.about.body} onChange={(v) => update((c) => ((c.pages.about.body = v), c))} />
            </Panel>

            {(["privacy", "terms", "refund", "shipping"] as const).map((k) => (
              <Panel key={k} title={STORE_PAGE_LABELS[k]}>
                <BoolRow
                  label={`Show ${STORE_PAGE_LABELS[k]}`}
                  value={config.pages[k].enabled}
                  onChange={(v) => update((c) => ((c.pages[k].enabled = v), c))}
                />
                <TextRow
                  label="Title"
                  value={config.pages[k].title}
                  onChange={(v) => update((c) => ((c.pages[k].title = v), c))}
                />
                <TextareaRow
                  label="Body"
                  value={config.pages[k].body}
                  onChange={(v) => update((c) => ((c.pages[k].body = v), c))}
                />
              </Panel>
            ))}

            <Panel title="FAQ">
              <BoolRow
                label="Show FAQ page"
                value={config.pages.faq.enabled}
                onChange={(v) => update((c) => ((c.pages.faq.enabled = v), c))}
              />
              <TextRow
                label="Title"
                value={config.pages.faq.title}
                onChange={(v) => update((c) => ((c.pages.faq.title = v), c))}
              />
              {config.pages.faq.items.map((it, i) => (
                <div key={i} className="rounded-sm border border-border p-2">
                  <TextRow
                    label={`Question ${i + 1}`}
                    value={it.q}
                    onChange={(v) =>
                      update((c) => ((c.pages.faq.items = c.pages.faq.items.map((x, j) => (j === i ? { ...x, q: v } : x))), c))
                    }
                  />
                  <TextareaRow
                    label="Answer"
                    value={it.a}
                    onChange={(v) =>
                      update((c) => ((c.pages.faq.items = c.pages.faq.items.map((x, j) => (j === i ? { ...x, a: v } : x))), c))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => update((c) => ((c.pages.faq.items = c.pages.faq.items.filter((_, j) => j !== i)), c))}
                    className="mt-1 text-xs text-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => update((c) => ((c.pages.faq.items = [...c.pages.faq.items, { q: "", a: "" }]), c))}
                className="text-xs font-semibold text-primary hover:underline"
              >
                + Add question
              </button>
            </Panel>
          </>
        )}

        {tab === "settings" && (
          <>
            <Panel title="Commerce">
              <BoolRow label="Cash on delivery" value={config.commerce.codEnabled} onChange={(v) => update((c) => ((c.commerce.codEnabled = v), c))} />
              <NumberRow label="Flat shipping" value={config.commerce.shippingFlatRate} onChange={(v) => update((c) => ((c.commerce.shippingFlatRate = v), c))} />
              <NumberRow label="Free shipping over (0 = off)" value={config.commerce.freeShippingOver ?? 0} onChange={(v) => update((c) => ((c.commerce.freeShippingOver = v || null), c))} />
              <NumberRow label="Minimum order" value={config.commerce.minOrder} onChange={(v) => update((c) => ((c.commerce.minOrder = v), c))} />
            </Panel>
            <Panel title="Contact">
              <TextRow label="Phone" value={config.contact.phone} onChange={(v) => update((c) => ((c.contact.phone = v), c))} />
              <TextRow label="WhatsApp" value={config.contact.whatsapp} onChange={(v) => update((c) => ((c.contact.whatsapp = v), c))} />
              <TextRow label="Email" value={config.contact.email} onChange={(v) => update((c) => ((c.contact.email = v), c))} />
              <TextRow label="Address" value={config.contact.address} onChange={(v) => update((c) => ((c.contact.address = v), c))} />
              <TextRow label="Hours" value={config.contact.hours} onChange={(v) => update((c) => ((c.contact.hours = v), c))} />
            </Panel>
            <Panel title="SEO">
              <TextareaRow label="Meta description" value={config.seo.description} onChange={(v) => update((c) => ((c.seo.description = v), c))} />
              <BoolRow label="Allow AI crawlers (GPTBot, ClaudeBot…)" value={config.seo.allowAiCrawlers} onChange={(v) => update((c) => ((c.seo.allowAiCrawlers = v), c))} />
            </Panel>
            <Panel title="Tracking">
              <TextRow
                label="Meta Pixel ID"
                value={config.tracking?.metaPixelId ?? ""}
                onChange={(v) => update((c) => ((c.tracking = { ...c.tracking, metaPixelId: v }), c))}
              />
              <TextRow
                label="Google Analytics 4 ID (G-XXXX)"
                value={config.tracking?.ga4MeasurementId ?? ""}
                onChange={(v) => update((c) => ((c.tracking = { ...c.tracking, ga4MeasurementId: v }), c))}
              />
              <p className="text-xs text-fg-subtle">Fires PageView, ViewContent, AddToCart and Purchase automatically.</p>
            </Panel>
            {published && (
              <Button size="sm" variant="outline" onClick={unpublish} disabled={publishing}>
                Unpublish storefront
              </Button>
            )}
          </>
        )}
      </div>

      {/* ── live preview ── */}
      <div className="hidden overflow-hidden rounded border border-border bg-surface lg:block">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-fg-muted">
          <span className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Live preview {dirty && "(save to update)"}
          </span>
          {published && storeUrl && (
            <a href={storeUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-primary">
              Open store <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <iframe
          key={previewKey}
          src="/storefront-preview"
          className="h-[calc(100vh-13rem)] w-full"
          title="Storefront preview"
        />
      </div>
    </div>
  );
}

/* ── field primitives ── */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-bold text-fg">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
const inputCls = "mt-1 h-9 w-full rounded-sm border border-border bg-surface px-2.5 text-sm";
function TextRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs font-medium text-fg">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}
function TextareaRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs font-medium text-fg">
      {label}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`${inputCls} h-auto py-2`} />
    </label>
  );
}
function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs font-medium text-fg">
      {label}
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className={inputCls} />
    </label>
  );
}
function BoolRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-fg">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
      {label}
    </label>
  );
}
function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs font-medium text-fg">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} capitalize`}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function SectionCard({
  section,
  onUp,
  onDown,
  onToggle,
  onDelete,
  onField,
}: {
  section: Section;
  onUp: () => void;
  onDown: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onField: (key: string, val: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const fields = SECTION_FIELDS[section.type];
  return (
    <div className={`rounded-sm border border-border ${section.enabled ? "" : "opacity-50"}`}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button onClick={onUp} className="text-fg-subtle hover:text-fg"><ChevronUp className="h-4 w-4" /></button>
        <button onClick={onDown} className="text-fg-subtle hover:text-fg"><ChevronDown className="h-4 w-4" /></button>
        <button onClick={() => setOpen((o) => !o)} className="flex-1 text-left text-xs font-semibold text-fg">
          {SECTION_LABELS[section.type]}
        </button>
        <input type="checkbox" checked={section.enabled} onChange={onToggle} className="h-3.5 w-3.5 accent-[var(--primary)]" />
        <button onClick={onDelete} className="text-fg-subtle hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-border p-2.5">
          {fields.map((f) =>
            f.type === "bool" ? (
              <BoolRow key={f.key} label={f.label} value={Boolean(section.data[f.key])} onChange={(v) => onField(f.key, v)} />
            ) : f.type === "textarea" ? (
              <TextareaRow key={f.key} label={f.label} value={String(section.data[f.key] ?? "")} onChange={(v) => onField(f.key, v)} />
            ) : f.type === "number" ? (
              <NumberRow key={f.key} label={f.label} value={Number(section.data[f.key] ?? 0)} onChange={(v) => onField(f.key, v)} />
            ) : (
              <TextRow key={f.key} label={f.label} value={String(section.data[f.key] ?? "")} onChange={(v) => onField(f.key, v)} />
            ),
          )}
          {fields.length === 0 && <p className="text-xs text-fg-subtle">This section has no options.</p>}
        </div>
      )}
    </div>
  );
}
