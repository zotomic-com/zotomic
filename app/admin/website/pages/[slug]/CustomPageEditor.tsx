"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import type { CustomPage } from "@/lib/site-content";
import { updateCustomPageAction, deleteCustomPageAction } from "../../actions";

export function CustomPageEditor({ page }: { page: CustomPage }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [seoTitle, setSeoTitle] = useState(page.seoTitle);
  const [seoDescription, setSeoDescription] = useState(page.seoDescription);
  const [status, setStatus] = useState(page.status);
  const [showInNav, setShowInNav] = useState(page.showInNav);
  const [navLabel, setNavLabel] = useState(page.navLabel || page.title);

  const save = () =>
    start(async () => {
      const res = await updateCustomPageAction(page.slug, { title, body, seoTitle, seoDescription, status, showInNav, navLabel });
      if ("error" in res) return toast(res.error, "error");
      toast("Saved", "success");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Page
            <Badge tone={status === "published" ? "success" : "neutral"}>{status}</Badge>
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {page.locked ? (
            <p className="text-xs text-fg-subtle">This page is required and always published at {page.route}.</p>
          ) : (
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={status === "published"}
                onChange={(e) => setStatus(e.target.checked ? "published" : "draft")}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Published (visible to the public at {page.route})
            </label>
          )}
          {!page.locked && (
            <>
              <label className="flex items-center gap-2 text-sm text-fg">
                <input type="checkbox" checked={showInNav} onChange={(e) => setShowInNav(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                Show a link to this page in the header navigation
              </label>
              {showInNav && (
                <Field label="Navigation label">
                  <Input value={navLabel} onChange={(e) => setNavLabel(e.target.value)} />
                </Field>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-xs text-fg-subtle">
            Start a section with <code className="rounded-sm bg-surface-2 px-1">## A heading</code>. Leave a blank line between
            paragraphs.
          </p>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className="font-mono text-xs" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SEO</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Page title (browser tab / search results)">
            <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          </Field>
          <Field label="Meta description">
            <Textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <Button disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {!page.locked && (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete "${page.title}"? This can't be undone.`)) return;
              start(async () => {
                const res = await deleteCustomPageAction(page.slug);
                if ("error" in res) return toast(res.error, "error");
                toast("Deleted", "success");
                router.push("/admin/website/pages");
              });
            }}
          >
            Delete page
          </Button>
        )}
      </div>
    </div>
  );
}
