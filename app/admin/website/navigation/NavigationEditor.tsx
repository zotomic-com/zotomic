"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { SITE_ICON_NAMES, siteIcon } from "@/lib/site-icons";
import type { NavLink } from "@/lib/site-nav";
import { createNavLinkAction, updateNavLinkAction, deleteNavLinkAction, reorderNavLinkAction } from "../actions";

const HEADER_SECTIONS = [
  { value: "primary", label: "Top group" },
  { value: "secondary", label: "Bottom group" },
];
const FOOTER_SECTIONS = [
  { value: "product", label: "Product column" },
  { value: "company", label: "Company column" },
  { value: "legal", label: "Legal column" },
];

function LinkRow({ link, withIcon, onSaved }: { link: NavLink; withIcon: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const Icon = siteIcon(link.icon);

  const patch = (p: Parameters<typeof updateNavLinkAction>[1]) =>
    start(async () => {
      await updateNavLinkAction(link.id, p);
      onSaved();
    });

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      {withIcon && <Icon className="h-4 w-4 shrink-0 text-primary" />}
      <span className="min-w-0 flex-1 truncate font-medium text-fg">{link.label}</span>
      <span className="truncate text-xs text-fg-subtle">{link.href}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1 text-fg-subtle">
        <button onClick={() => start(async () => { await reorderNavLinkAction(link.id, "up"); onSaved(); })} disabled={pending} className="hover:text-fg">
          <ArrowUp className="h-4 w-4" />
        </button>
        <button onClick={() => start(async () => { await reorderNavLinkAction(link.id, "down"); onSaved(); })} disabled={pending} className="hover:text-fg">
          <ArrowDown className="h-4 w-4" />
        </button>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={link.enabled} onChange={(e) => patch({ enabled: e.target.checked })} disabled={pending} className="h-3.5 w-3.5 accent-[var(--primary)]" />
          shown
        </label>
        <button
          onClick={() => {
            if (!confirm(`Remove "${link.label}"?`)) return;
            start(async () => {
              await deleteNavLinkAction(link.id);
              toast("Removed", "success");
              onSaved();
            });
          }}
          disabled={pending}
          className="hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </span>
    </li>
  );
}

function SectionEditor({
  location,
  section,
  label,
  links,
  withIcon,
  onSaved,
}: {
  location: "header" | "footer";
  section: string;
  label: string;
  links: NavLink[];
  withIcon: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [href, setHref] = useState("");
  const [icon, setIcon] = useState("Sparkles");

  const add = () =>
    start(async () => {
      await createNavLinkAction({ location, section, label: linkLabel, href, icon: withIcon ? icon : null });
      toast("Added", "success");
      setLinkLabel("");
      setHref("");
      setAdding(false);
      onSaved();
    });

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {links.map((l) => (
          <LinkRow key={l.id} link={l} withIcon={withIcon} onSaved={onSaved} />
        ))}
        {links.length === 0 && <li className="px-3 py-3 text-xs text-fg-subtle">No links.</li>}
      </ul>
      {adding ? (
        <div className={`mt-2 grid gap-2 rounded-lg border border-border p-3 ${withIcon ? "sm:grid-cols-[100px_1fr_1fr]" : "sm:grid-cols-2"}`}>
          {withIcon && (
            <Field label="Icon">
              <Select value={icon} onChange={(e) => setIcon(e.target.value)}>
                {SITE_ICON_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Label">
            <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
          </Field>
          <Field label="URL">
            <Input value={href} onChange={(e) => setHref(e.target.value)} placeholder="/pricing or https://…" />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-full">
            <Button size="sm" disabled={pending || !linkLabel.trim() || !href.trim()} onClick={add}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add link
        </Button>
      )}
    </div>
  );
}

export function NavigationEditor({ header, footer }: { header: NavLink[]; footer: NavLink[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Header (side drawer)</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {HEADER_SECTIONS.map((s) => (
            <SectionEditor
              key={s.value}
              location="header"
              section={s.value}
              label={s.label}
              links={header.filter((l) => l.section === s.value)}
              withIcon
              onSaved={refresh}
            />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Footer</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {FOOTER_SECTIONS.map((s) => (
            <SectionEditor
              key={s.value}
              location="footer"
              section={s.value}
              label={s.label}
              links={footer.filter((l) => l.section === s.value)}
              withIcon={false}
              onSaved={refresh}
            />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
