"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { savePlatformPageAction } from "./actions";

export interface EditablePage {
  slug: string;
  label: string;
  route: string;
  title: string;
  body: string;
  updatedAt: string | null;
}

export function PagesEditor({ pages }: { pages: EditablePage[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [active, setActive] = useState(pages[0]?.slug ?? "");
  const page = pages.find((p) => p.slug === active) ?? pages[0];

  if (!page) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
      <div className="flex gap-1 overflow-x-auto lg:flex-col">
        {pages.map((p) => (
          <button
            key={p.slug}
            onClick={() => setActive(p.slug)}
            className={`shrink-0 rounded-sm px-3 py-2 text-left text-sm font-medium ${
              active === p.slug ? "bg-primary-soft text-primary" : "text-fg-muted hover:bg-surface-2"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Card key={page.slug}>
        <CardHeader>
          <CardTitle>{page.label}</CardTitle>
          <Link href={page.route} target="_blank" className="flex items-center gap-1 text-xs font-semibold text-primary">
            View live <ExternalLink className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardBody>
          <form
            action={(fd) =>
              start(async () => {
                const res = await savePlatformPageAction(fd);
                if (res.error) toast(res.error, "error");
                else {
                  toast("Saved", "success");
                  router.refresh();
                }
              })
            }
            className="space-y-4"
          >
            <input type="hidden" name="slug" value={page.slug} />
            <Field label="Title">
              <Input name="title" defaultValue={page.title} required />
            </Field>
            <Field
              label="Body"
              hint={'Start a section with "## Heading". Separate paragraphs with a blank line. For the FAQ, each "## " line is a question and the text below it is the answer.'}
            >
              <Textarea name="body" defaultValue={page.body} rows={22} className="font-mono text-xs" />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save page"}
              </Button>
              {page.updatedAt && (
                <span className="text-xs text-fg-subtle">
                  Last saved {new Date(page.updatedAt).toLocaleString("en-GB")}
                </span>
              )}
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
