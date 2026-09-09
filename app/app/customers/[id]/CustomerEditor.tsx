"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateCustomer } from "../actions";

export function CustomerEditor({
  id,
  initial,
}: {
  id: string;
  initial: { name: string; phone: string; email: string; city: string; notes: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [f, setF] = useState(initial);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const save = () =>
    start(async () => {
      const res = await updateCustomer(id, f);
      if ("error" in res) return toast(res.error, "error");
      toast("Saved", "success");
      router.refresh();
    });

  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
      </div>
      <Field label="Notes" hint="Only visible to your team">
        <Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
