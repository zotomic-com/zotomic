"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { updateBusinessSettings } from "./actions";

const CURRENCIES = ["BDT", "USD", "INR", "PKR", "EUR", "GBP"];
const TIMEZONES = ["Asia/Dhaka", "Asia/Kolkata", "Asia/Karachi", "UTC", "Europe/London", "America/New_York"];

export interface BusinessSettings {
  name: string;
  type: string | null;
  currency: string;
  timezone: string;
  description: string | null;
  telegram_chat_id: string | null;
}

export function SettingsClient({
  business,
  user,
}: {
  business: BusinessSettings;
  user: { name: string; email: string; role: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const save = (fd: FormData) =>
    start(async () => {
      const res = await updateBusinessSettings(fd);
      if (res.error) toast(res.error, "error");
      else {
        toast("Settings saved", "success");
        router.refresh();
      }
    });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={save} className="space-y-4">
            <Field label="Business name">
              <Input name="name" required defaultValue={business.name} />
            </Field>
            <Field label="Business type">
              <Input name="type" defaultValue={business.type ?? ""} placeholder="Fashion & Apparel" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select name="currency" defaultValue={business.currency}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Timezone">
                <Select name="timezone" defaultValue={business.timezone}>
                  {TIMEZONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea name="description" defaultValue={business.description ?? ""} />
            </Field>
            <Field
              label="Telegram chat ID"
              hint="For assistant-delivered reports. Message @userinfobot on Telegram to get your ID, then start a chat with the Zotomic bot."
            >
              <Input name="telegram_chat_id" defaultValue={business.telegram_chat_id ?? ""} placeholder="123456789" />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-subtle">Name</dt>
              <dd className="font-medium text-fg">{user.name}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Email</dt>
              <dd className="font-medium text-fg">{user.email}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Role</dt>
              <dd className="font-medium capitalize text-fg">{user.role}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
