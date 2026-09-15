"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { socialIcon, SOCIAL_PLATFORM_LABELS } from "@/lib/social-icons";
import type { SocialLink, SocialLinkInput, SocialPlatform } from "@/lib/social-links";
import { createSocialLinkAction, updateSocialLinkAction, deleteSocialLinkAction, reorderSocialLinkAction } from "../actions";

const PLATFORMS = Object.keys(SOCIAL_PLATFORM_LABELS) as SocialPlatform[];
const EMPTY: SocialLinkInput = { platform: "facebook", url: "" };

function LinkFields({ draft, onChange }: { draft: SocialLinkInput; onChange: (patch: Partial<SocialLinkInput>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
      <Field label="Platform">
        <Select value={draft.platform} onChange={(e) => onChange({ platform: e.target.value as SocialPlatform })}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {SOCIAL_PLATFORM_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="URL">
        <Input value={draft.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://facebook.com/yourpage" />
      </Field>
    </div>
  );
}

function ExistingRow({ link, index, total }: { link: SocialLink; index: number; total: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<SocialLinkInput>({ platform: link.platform, url: link.url });
  const Icon = socialIcon(draft.platform);
  const refresh = () => router.refresh();

  const save = () =>
    start(async () => {
      await updateSocialLinkAction(link.id, draft);
      toast("Saved", "success");
      refresh();
    });

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Icon className="h-4 w-4 text-primary" />
            {SOCIAL_PLATFORM_LABELS[link.platform]}
          </span>
          <span className="flex items-center gap-1 text-fg-subtle">
            <button
              onClick={() => start(async () => { await reorderSocialLinkAction(link.id, "up"); refresh(); })}
              disabled={pending || index === 0}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => start(async () => { await reorderSocialLinkAction(link.id, "down"); refresh(); })}
              disabled={pending || index === total - 1}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (!confirm(`Delete this ${SOCIAL_PLATFORM_LABELS[link.platform]} link?`)) return;
                start(async () => {
                  await deleteSocialLinkAction(link.id);
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
        <LinkFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={save}>
            Save
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function SocialLinksEditor({ links }: { links: SocialLink[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<SocialLinkInput>(EMPTY);
  const [adding, setAdding] = useState(false);

  const add = () =>
    start(async () => {
      const res = await createSocialLinkAction(draft);
      if ("error" in res) return toast(res.error, "error");
      toast("Added", "success");
      setDraft(EMPTY);
      setAdding(false);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {links.map((l, i) => (
        <ExistingRow key={l.id} link={l} index={i} total={links.length} />
      ))}
      {links.length === 0 && <p className="text-sm text-fg-subtle">No social links yet.</p>}

      {adding ? (
        <Card>
          <CardBody className="space-y-3">
            <LinkFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setDraft(EMPTY); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !draft.url.trim()} onClick={add}>
                Add link
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add a social link
        </Button>
      )}
    </div>
  );
}
