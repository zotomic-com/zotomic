"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { saveWebsiteSettings } from "./actions";

interface F {
  key: string;
  label: string;
  secret: boolean;
  value: string;
  hint?: string;
}

export function SettingsFieldsForm({ fields }: { fields: F[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await saveWebsiteSettings(fd);
          toast(res.note ?? "Saved", res.note && res.note.includes(":") ? "error" : "success");
          router.refresh();
        })
      }
      className="space-y-3"
    >
      {fields.map((f) => (
        <Field key={f.key} label={f.label}>
          <Input name={f.key} type={f.secret ? "password" : "text"} defaultValue={f.value} autoComplete="off" placeholder={f.hint} />
        </Field>
      ))}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
