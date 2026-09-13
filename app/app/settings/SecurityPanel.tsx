"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateEmailAction, updatePhoneAction, updateAddressAction, changePasswordAction } from "./account-actions";

interface SecurityUser {
  email: string;
  phone: string;
  address: string;
}

export function SecurityPanel({ user, hasPassword }: { user: SecurityUser; hasPassword: boolean }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [email, setEmail] = useState(user.email);
  const [emailPw, setEmailPw] = useState("");
  const [phone, setPhone] = useState(user.phone);
  const [phonePw, setPhonePw] = useState("");
  const [address, setAddress] = useState(user.address);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");

  const run = (fn: () => Promise<{ ok: true } | { error: string }>, onOk: () => void) =>
    start(async () => {
      const res = await fn();
      if ("error" in res) return toast(res.error, "error");
      toast("Saved", "success");
      onOk();
    });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateEmailAction({ newEmail: email, currentPassword: emailPw }), () => setEmailPw(""));
            }}
            className="max-w-sm space-y-3"
          >
            <Field label="Email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Current password" hint="Required to confirm this is really you.">
              <Input type="password" required value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
            </Field>
            <Button type="submit" size="sm" disabled={pending}>
              Update email
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phone number</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updatePhoneAction({ newPhone: phone, currentPassword: phonePw }), () => setPhonePw(""));
            }}
            className="max-w-sm space-y-3"
          >
            <Field label="Phone">
              <Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </Field>
            <Field label="Current password">
              <Input type="password" required value={phonePw} onChange={(e) => setPhonePw(e.target.value)} />
            </Field>
            <Button type="submit" size="sm" disabled={pending}>
              Update phone
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateAddressAction({ newAddress: address }), () => {});
            }}
            className="max-w-sm space-y-3"
          >
            <Field label="Address" hint="Used to prefill checkout when you buy a domain or other service.">
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
            </Field>
            <Button type="submit" size="sm" disabled={pending}>
              Update address
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => changePasswordAction({ currentPassword: currentPw || undefined, newPassword: newPw }),
                () => {
                  setCurrentPw("");
                  setNewPw("");
                },
              );
            }}
            className="max-w-sm space-y-3"
          >
            {hasPassword ? (
              <Field label="Current password">
                <Input type="password" required value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
              </Field>
            ) : (
              <p className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-xs text-fg-subtle">
                Your account currently signs in with Google/Facebook only. Set a password below to also be able to sign in with
                email.
              </p>
            )}
            <Field label="New password" hint="At least 8 characters.">
              <Input type="password" required minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </Field>
            <Button type="submit" size="sm" disabled={pending}>
              {hasPassword ? "Change password" : "Set password"}
            </Button>
          </form>
          <p className="text-xs text-fg-subtle">
            Forgot your password entirely?{" "}
            <Link href="/forgot-password" className="font-medium text-primary hover:underline">
              Reset it from the login page
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
