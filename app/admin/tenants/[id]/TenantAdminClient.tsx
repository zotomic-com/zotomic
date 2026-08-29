"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  adminDeleteBusiness,
  adminImpersonate,
  adminSetFeature,
  adminSetSubscription,
  adminUnpublishStore,
  adminUpdateBusiness,
} from "./actions";

const FEATURES: { key: string; label: string; hint: string }[] = [
  { key: "payment_gateway", label: "Payment gateway", hint: "Normally Business plan only" },
  { key: "courier", label: "Courier", hint: "All plans by default" },
  { key: "server_tracking", label: "Server-side tracking", hint: "Business plan only" },
  { key: "custom_domain", label: "Custom domain", hint: "Business plan only" },
];

export function TenantAdminClient({
  businessId,
  business,
  subscription,
  overrides,
  published,
}: {
  businessId: string;
  business: { name: string; type: string | null; currency: string; timezone: string; status: string };
  subscription: { plan: string; status: string; current_period_end: string | null };
  overrides: Record<string, boolean>;
  published: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [confirmName, setConfirmName] = useState("");

  const run = (fn: () => Promise<{ error?: string; ok?: boolean; deleted?: boolean; redirect?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast(res.error, "error");
      else {
        toast("Saved", "success");
        if (res.redirect) window.location.href = res.redirect;
        else if (res.deleted) router.push("/admin/tenants");
        else router.refresh();
      }
    });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={(fd) => run(() => adminUpdateBusiness(businessId, fd))} className="space-y-3">
            <Field label="Name">
              <Input name="name" defaultValue={business.name} required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type">
                <Input name="type" defaultValue={business.type ?? ""} />
              </Field>
              <Field label="Currency">
                <Input name="currency" defaultValue={business.currency} />
              </Field>
              <Field label="Timezone">
                <Input name="timezone" defaultValue={business.timezone} />
              </Field>
              <Field label="Account status">
                <Select name="status" defaultValue={business.status}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended (blocks all access)</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              Save business
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription override</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={(fd) => run(() => adminSetSubscription(businessId, fd))} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Plan">
                <Select name="plan" defaultValue={subscription.plan}>
                  <option value="free">Free</option>
                  <option value="business">Business</option>
                  <option value="pro">Pro</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select name="status" defaultValue={subscription.status}>
                  {["active", "grace", "soft_lock", "hard_lock", "cancelled"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Extend by (days)">
                <Input name="extendDays" type="number" defaultValue={0} min={0} />
              </Field>
            </div>
            <p className="text-xs text-fg-subtle">
              Renews: {subscription.current_period_end ?? "—"}
            </p>
            <Button type="submit" size="sm" disabled={pending}>
              Apply
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature grants</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {FEATURES.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 rounded-sm border border-border p-3">
              <span>
                <span className="block text-sm font-medium text-fg">{f.label}</span>
                <span className="block text-xs text-fg-subtle">{f.hint}</span>
              </span>
              <input
                type="checkbox"
                checked={!!overrides[f.key]}
                onChange={(e) => run(() => adminSetFeature(businessId, f.key, e.target.checked))}
                className="h-4 w-4 accent-[var(--primary)]"
              />
            </label>
          ))}
          <p className="text-xs text-fg-subtle">
            Checked = force-enabled for this business regardless of plan.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storefront &amp; danger zone</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Button size="sm" variant="outline" onClick={() => run(() => adminImpersonate(businessId))} disabled={pending}>
            Sign in as owner (support)
          </Button>
          {published && (
            <Button size="sm" variant="outline" onClick={() => run(() => adminUnpublishStore(businessId))} disabled={pending}>
              Take storefront offline
            </Button>
          )}
          <div className="rounded-sm border border-danger/30 bg-danger-soft p-3">
            <p className="text-sm font-bold text-danger">Delete business</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Permanently removes the business and all its products, orders, customers and reports.
            </p>
            <div className="mt-2 flex gap-2">
              <Input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={`Type "${business.name}"`}
                className="max-w-xs"
              />
              <Button
                size="sm"
                variant="danger"
                disabled={pending || confirmName.trim() !== business.name}
                onClick={() => run(() => adminDeleteBusiness(businessId, confirmName))}
              >
                Delete
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
