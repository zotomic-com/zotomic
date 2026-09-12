"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Lock, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { StructuralSlug, CustomPage } from "@/lib/site-content";
import { createCustomPageAction, deleteCustomPageAction, updateCustomPageAction } from "../actions";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com").replace(/\/$/, "");

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function PagesList({
  structural,
  custom,
}: {
  structural: { slug: StructuralSlug; label: string; route: string; title: string; updatedAt: string | null }[];
  custom: CustomPage[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const submitNew = () =>
    start(async () => {
      const finalSlug = slugTouched ? slug : slugify(title);
      const res = await createCustomPageAction({
        slug: finalSlug,
        title,
        body: `## ${title}\nWrite this page's content here.`,
        seoTitle: title,
        seoDescription: "",
        status: "draft",
        showInNav: false,
        navLabel: title,
      });
      if ("error" in res) return toast(res.error, "error");
      toast("Page created", "success");
      router.push(`/admin/website/pages/${finalSlug}`);
    });

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold text-fg">Fixed pages</p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {structural.map((p) => (
            <li key={p.slug} className="flex items-center gap-2.5 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-fg">{p.label}</span>
                <span className="ml-2 text-xs text-fg-subtle">{p.route}</span>
              </span>
              <a href={`${SITE}${p.route}`} target="_blank" rel="noreferrer" className="text-fg-subtle hover:text-fg" title="View live">
                <ExternalLink className="h-4 w-4" />
              </a>
              <Link href={`/admin/website/pages/${p.slug}`} className="text-fg-subtle hover:text-primary" title="Edit">
                <Pencil className="h-4 w-4" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-fg">Custom pages</p>
          <Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" /> Add page
          </Button>
        </div>

        {adding && (
          <div className="mb-3 space-y-2 rounded-lg border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }}
                  placeholder="e.g. Our story"
                />
              </Field>
              <Field label="URL">
                <div className="flex items-center gap-1 text-sm text-fg-subtle">
                  <span className="shrink-0">/p/</span>
                  <Input
                    value={slug}
                    onChange={(e) => {
                      setSlug(slugify(e.target.value));
                      setSlugTouched(true);
                    }}
                    placeholder="our-story"
                  />
                </div>
              </Field>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending || !title.trim() || !slug} onClick={submitNew}>
                Create & edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {custom.length === 0 ? (
          <p className="text-xs text-fg-subtle">No custom pages yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {custom.map((p) => (
              <li key={p.slug} className="flex items-center gap-2.5 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium text-fg">{p.title}</span>
                    <Badge tone={p.status === "published" ? "success" : "neutral"}>{p.status}</Badge>
                    {p.locked && <Lock className="h-3 w-3 text-fg-subtle" />}
                  </span>
                  <span className="text-xs text-fg-subtle">{p.route}</span>
                </span>
                <a href={`${SITE}${p.route}`} target="_blank" rel="noreferrer" className="text-fg-subtle hover:text-fg" title="View live">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={() =>
                    start(async () => {
                      const res = await updateCustomPageAction(p.slug, { status: p.status === "published" ? "draft" : "published" });
                      if ("error" in res) toast(res.error, "error");
                      else toast(p.status === "published" ? "Unpublished" : "Published", "success");
                      router.refresh();
                    })
                  }
                  disabled={pending}
                  className="text-fg-subtle hover:text-fg"
                  title={p.status === "published" ? "Unpublish" : "Publish"}
                >
                  <Power className="h-4 w-4" />
                </button>
                <Link href={`/admin/website/pages/${p.slug}`} className="text-fg-subtle hover:text-primary" title="Edit">
                  <Pencil className="h-4 w-4" />
                </Link>
                {!p.locked && (
                  <button
                    onClick={() => {
                      if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
                      start(async () => {
                        const res = await deleteCustomPageAction(p.slug);
                        if ("error" in res) toast(res.error, "error");
                        else {
                          toast("Deleted", "success");
                          router.refresh();
                        }
                      });
                    }}
                    disabled={pending}
                    className="text-fg-subtle hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
