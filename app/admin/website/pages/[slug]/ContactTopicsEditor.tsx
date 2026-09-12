"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ContactTopic } from "@/lib/contact-topics";
import { createContactTopicAction, updateContactTopicAction, deleteContactTopicAction, reorderContactTopicAction } from "../../actions";

export function ContactTopicsEditor({ topics }: { topics: ContactTopic[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");

  const refresh = () => router.refresh();

  const add = () =>
    start(async () => {
      const res = await createContactTopicAction(label);
      if ("error" in res) return toast(res.error, "error");
      toast("Added", "success");
      setLabel("");
      refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact form topics</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-fg-muted">The options shown in the &quot;Topic&quot; dropdown on the contact form.</p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {topics.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2.5 px-3 py-2.5 text-sm">
              <span className={`min-w-0 flex-1 truncate font-medium ${t.enabled ? "text-fg" : "text-fg-subtle line-through"}`}>{t.label}</span>
              <span className="flex items-center gap-1 text-fg-subtle">
                <button
                  onClick={() => start(async () => { await reorderContactTopicAction(t.id, "up"); refresh(); })}
                  disabled={pending || i === 0}
                  className="disabled:opacity-30 hover:text-fg"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => start(async () => { await reorderContactTopicAction(t.id, "down"); refresh(); })}
                  disabled={pending || i === topics.length - 1}
                  className="disabled:opacity-30 hover:text-fg"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    onChange={(e) => start(async () => { await updateContactTopicAction(t.id, { enabled: e.target.checked }); refresh(); })}
                    disabled={pending}
                    className="h-3.5 w-3.5 accent-[var(--primary)]"
                  />
                  shown
                </label>
                <button
                  onClick={() => {
                    if (!confirm(`Remove "${t.label}"?`)) return;
                    start(async () => {
                      await deleteContactTopicAction(t.id);
                      toast("Removed", "success");
                      refresh();
                    });
                  }}
                  disabled={pending}
                  className="hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
          {topics.length === 0 && <li className="px-3 py-3 text-xs text-fg-subtle">No topics yet.</li>}
        </ul>

        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Press inquiry" className="max-w-xs" />
          <Button size="sm" disabled={pending || !label.trim()} onClick={add}>
            <Plus className="h-4 w-4" /> Add topic
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
