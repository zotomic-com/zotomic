import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { listConvTypes, CONV_GROUPS, type ConvType } from "@/lib/services/converter";
import { createTypeAction, deleteTypeAction, moveTypeAction, toggleTypeAction, updateTypeAction } from "./actions";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Converter — Admin" };

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-fg outline-none focus:border-primary";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-fg-subtle";

function TypeRow({ type }: { type: ConvType }) {
  const optionsJson = JSON.stringify(type.options, null, 2);
  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-fg">{type.slug}</span>
          <Badge tone="neutral">{type.group}</Badge>
          <Badge tone={type.enabled ? "success" : "warning"}>{type.enabled ? "live" : "hidden"}</Badge>
          <span className="text-xs text-fg-subtle">{type.options.length} option(s)</span>
        </span>
        <span className="flex items-center gap-1">
          <form action={moveTypeAction}>
            <input type="hidden" name="id" value={type.id} />
            <input type="hidden" name="direction" value="up" />
            <button className="rounded border border-border p-1.5 text-fg-muted hover:border-primary hover:text-primary" title="Move up">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </form>
          <form action={moveTypeAction}>
            <input type="hidden" name="id" value={type.id} />
            <input type="hidden" name="direction" value="down" />
            <button className="rounded border border-border p-1.5 text-fg-muted hover:border-primary hover:text-primary" title="Move down">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </form>
          <form action={toggleTypeAction}>
            <input type="hidden" name="id" value={type.id} />
            <input type="hidden" name="enabled" value={type.enabled ? "false" : "true"} />
            <button className="rounded border border-border px-2.5 py-1.5 text-xs font-semibold text-fg-muted hover:border-primary hover:text-primary">
              {type.enabled ? "Hide" : "Show"}
            </button>
          </form>
          <form action={deleteTypeAction}>
            <input type="hidden" name="id" value={type.id} />
            <button className="rounded border border-border p-1.5 text-danger hover:bg-danger-soft" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </form>
        </span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer select-none text-xs font-semibold text-primary">Edit</summary>
        <form action={updateTypeAction} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={type.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Label</label>
              <input name="label" defaultValue={type.label} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Slug</label>
              <input name="slug" defaultValue={type.slug} className={`${inputCls} font-mono`} required />
            </div>
            <div>
              <label className={labelCls}>Group</label>
              <select name="group" defaultValue={type.group} className={inputCls}>
                {CONV_GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Sort order</label>
              <input name="sortOrder" type="number" defaultValue={type.sortOrder} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Description</label>
              <input name="description" defaultValue={type.description ?? ""} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Accepted files (input accept attribute)</label>
              <input name="accept" defaultValue={type.accept} className={`${inputCls} font-mono`} placeholder="image/*,.pdf" />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-fg">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="multiple" defaultChecked={type.multiple} /> Multiple files
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="needsFile" defaultChecked={type.needsFile} /> Requires a file
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="enabled" defaultChecked={type.enabled} /> Enabled
            </label>
          </div>
          <div>
            <label className={labelCls}>Options (JSON array)</label>
            <textarea
              name="options"
              defaultValue={optionsJson}
              rows={Math.min(14, optionsJson.split("\n").length + 1)}
              className={`${inputCls} mt-1 font-mono text-xs`}
              spellCheck={false}
            />
          </div>
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            Save changes
          </button>
        </form>
      </details>
    </li>
  );
}

export default async function AdminConverterPage() {
  await requireAdmin();
  const db = adminDb();
  const [types, usage] = await Promise.all([
    listConvTypes(),
    db
      .from("service_usage")
      .select("id", { count: "exact", head: true })
      .eq("service", "converter")
      .eq("ok", true)
      .then((r) => r.count ?? 0),
  ]);

  const grouped = CONV_GROUPS.map((g) => ({ ...g, items: types.filter((t) => t.group === g.id) }));

  return (
    <div className="space-y-4">
      <Link href="/admin/services" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Service tools
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy">Converter</h1>
          <p className="text-sm text-fg-muted">
            Add, edit, reorder, hide or delete the converters customers see under Services → Converter.
            Changes go live immediately.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tracking-tight text-navy">{usage}</p>
          <p className="text-xs text-fg-muted">conversions logged</p>
        </div>
      </div>

      {grouped.map((g) => (
        <section key={g.id} className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg-muted">
            {g.label} <span className="font-normal normal-case text-fg-subtle">· {g.blurb}</span>
          </h2>
          {g.items.length ? (
            <ul className="space-y-2">
              {g.items.map((t) => (
                <TypeRow key={t.id} type={t} />
              ))}
            </ul>
          ) : (
            <Card>
              <CardBody className="text-sm text-fg-muted">No {g.label.toLowerCase()} converters yet.</CardBody>
            </Card>
          )}
        </section>
      ))}

      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-bold text-fg">Add a converter</p>
          <form action={createTypeAction} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Label</label>
                <input name="label" className={inputCls} placeholder="Subtitles → Text" required />
              </div>
              <div>
                <label className={labelCls}>Slug</label>
                <input name="slug" className={`${inputCls} font-mono`} placeholder="subtitles-to-text" required />
              </div>
              <div>
                <label className={labelCls}>Group</label>
                <select name="group" className={inputCls} defaultValue="image">
                  {CONV_GROUPS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Sort order</label>
                <input name="sortOrder" type="number" defaultValue={types.length} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Description</label>
                <input name="description" className={inputCls} placeholder="One line shown under the name." />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Accepted files</label>
                <input name="accept" className={`${inputCls} font-mono`} placeholder="image/*,.pdf" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-fg">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="multiple" /> Multiple files
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="needsFile" defaultChecked /> Requires a file
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="enabled" defaultChecked /> Enabled
              </label>
            </div>
            <div>
              <label className={labelCls}>Options (JSON array)</label>
              <textarea
                name="options"
                rows={5}
                defaultValue="[]"
                className={`${inputCls} mt-1 font-mono text-xs`}
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-fg-subtle">
                Shape: {`{"id":"format","label":"Output format","type":"select","value":"mp4","options":["mp4","webm"]}`}
                {" — "}type is select, number or text.
              </p>
            </div>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
              Create converter
            </button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
