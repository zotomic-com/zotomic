"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { CATEGORY_LABEL } from "@/lib/fraud/phone";
import { setStageAction, clearFlagAction, recomputeFlagAction } from "../actions";

export function FraudFlagActions({
  flagId,
  stage,
  category,
  reason,
  hasPhone,
}: {
  flagId: string;
  stage: number;
  category: string;
  reason: string;
  hasPhone: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  const run = (fn: () => Promise<{ error?: string } | { ok?: unknown }>, ok = "Done") =>
    start(async () => {
      const res = (await fn()) as { error?: string };
      if (res?.error) return toast(res.error, "error");
      toast(ok, "success");
      setEditOpen(false);
      router.refresh();
    });

  const setStage = (s: 1 | 2 | 3) =>
    run(() => setStageAction({ flagId, stage: s, category, reason }), `Set to ${["", "Watch", "Suspect", "Blacklist"][s]}`);

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={stage === 1 ? "primary" : "secondary"} disabled={pending} onClick={() => setStage(1)}>
        Watch
      </Button>
      <Button size="sm" variant={stage === 2 ? "primary" : "secondary"} disabled={pending} onClick={() => setStage(2)}>
        Suspect
      </Button>
      <Button size="sm" variant={stage === 3 ? "danger" : "secondary"} disabled={pending} onClick={() => setStage(3)}>
        Blacklist
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
        Edit
      </Button>
      {hasPhone && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => recomputeFlagAction(flagId), "Recomputed")}>
          Recompute
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-fg-subtle"
        disabled={pending}
        onClick={() => {
          if (confirm("Clear this flag as a false positive?")) run(() => clearFlagAction(flagId), "Cleared");
        }}
      >
        Clear
      </Button>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit flag">
        <form
          action={(f) =>
            run(
              () =>
                setStageAction({
                  flagId,
                  stage,
                  category: String(f.get("category") ?? category),
                  reason: String(f.get("reason") ?? ""),
                }),
              "Saved",
            )
          }
          className="space-y-3"
        >
          <Field label="Category">
            <Select name="category" defaultValue={category}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason / notes">
            <Textarea name="reason" rows={3} defaultValue={reason} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
