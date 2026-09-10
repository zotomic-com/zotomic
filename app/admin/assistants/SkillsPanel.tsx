"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Plus, Trash2, Power, Pencil } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { saveSkill, toggleSkill, deleteSkill, type SkillRow } from "./actions";

export function SkillsPanel({ skills }: { skills: SkillRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [triggers, setTriggers] = useState("");
  const [instructions, setInstructions] = useState("");

  const run = (fn: () => Promise<{ ok?: true; error?: string }>, ok = "Saved") =>
    start(async () => {
      const res = await fn();
      if (res?.error) return toast(res.error, "error");
      toast(ok, "success");
      setEditing(null);
      router.refresh();
    });

  const openEdit = (s?: SkillRow) => {
    setEditing(s ? s.id : "new");
    setName(s?.name ?? "");
    setTriggers((s?.triggers ?? []).join(", "));
    setInstructions(s?.instructions ?? "");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Skills
          </span>
        </CardTitle>
        <span className="text-xs text-fg-subtle">Saved playbooks — say a trigger phrase in chat and Zotomic follows the steps</span>
      </CardHeader>

      <CardBody className="space-y-3">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {skills.map((s) =>
            editing === s.id ? (
              <li key={s.id} className="p-3">
                <SkillForm
                  name={name}
                  triggers={triggers}
                  instructions={instructions}
                  setName={setName}
                  setTriggers={setTriggers}
                  setInstructions={setInstructions}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={() => run(() => saveSkill({ id: s.id, name, triggers, instructions }))}
                />
              </li>
            ) : (
              <li key={s.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{s.name}</span>
                    {s.builtin && <Badge tone="neutral">built-in</Badge>}
                    {s.enabled ? <Badge tone="success">on</Badge> : <Badge tone="neutral">off</Badge>}
                  </span>
                  <span className="block text-xs text-fg-subtle">
                    triggers: {s.triggers.map((t) => `"${t}"`).join(", ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-fg-subtle">
                  <button onClick={() => openEdit(s)} title="Edit" className="hover:text-fg" disabled={pending}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => run(() => toggleSkill(s.id, !s.enabled), "Updated")}
                    disabled={pending}
                    title={s.enabled ? "Disable" : "Enable"}
                    className="hover:text-fg"
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  {!s.builtin && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete skill "${s.name}"?`)) run(() => deleteSkill(s.id), "Deleted");
                      }}
                      disabled={pending}
                      className="hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </li>
            ),
          )}
        </ul>

        {editing === "new" ? (
          <div className="rounded-lg border border-dashed border-border p-3">
            <SkillForm
              name={name}
              triggers={triggers}
              instructions={instructions}
              setName={setName}
              setTriggers={setTriggers}
              setInstructions={setInstructions}
              pending={pending}
              onCancel={() => setEditing(null)}
              onSave={() => run(() => saveSkill({ name, triggers, instructions }))}
            />
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => openEdit()}>
            <Plus className="h-4 w-4" /> New skill
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function SkillForm({
  name,
  triggers,
  instructions,
  setName,
  setTriggers,
  setInstructions,
  pending,
  onCancel,
  onSave,
}: {
  name: string;
  triggers: string;
  instructions: string;
  setName: (v: string) => void;
  setTriggers: (v: string) => void;
  setInstructions: (v: string) => void;
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly digest" />
        </Field>
        <Field label="Trigger phrases" hint="comma or line separated">
          <Input value={triggers} onChange={(e) => setTriggers(e.target.value)} placeholder="weekly digest, how's the platform" />
        </Field>
      </div>
      <Field label="Instructions" hint="what Zotomic should do — reference tools by name">
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={5}
          placeholder="Steps: 1) call platform_overview. 2) ..."
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={pending || !name.trim() || !instructions.trim()} onClick={onSave}>
          Save skill
        </Button>
      </div>
    </div>
  );
}
