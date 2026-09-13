"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateProfileAction } from "./account-actions";

interface ProfileUser {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export function ProfilePanel({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(user.name);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateProfileAction({ name });
      if ("error" in res) return toast(res.error, "error");
      toast("Saved", "success");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        <form onSubmit={save} className="max-w-sm space-y-3">
          <Field label="Full name">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save name"}
          </Button>
        </form>

        <div className="border-t border-border pt-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-subtle">Email</dt>
              <dd className="font-medium text-fg">{user.email}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Phone</dt>
              <dd className="font-medium text-fg">{user.phone || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-fg-subtle">Address</dt>
              <dd className="font-medium text-fg">{user.address || "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-fg-subtle">
            To change your email, phone, address, or password, go to{" "}
            <Link href="/app/settings?tab=security" className="font-medium text-primary hover:underline">
              Security
            </Link>
            .
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
