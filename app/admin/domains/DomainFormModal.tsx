"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { createManualDomainAction, updateDomainRecordAction, type DomainRecordInput } from "./actions";

const STATUS_OPTIONS = ["pending", "registering", "transferring", "active", "grace", "dropped", "failed", "cancelled"];

export interface DomainFormValues {
  domainName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  pointTo: "self" | "zotomic";
  paymentMethod: "bkash" | "nagad";
  retailPrice: string;
  wholesaleCost: string;
  status: string;
  expiresAt: string;
}

const EMPTY: DomainFormValues = {
  domainName: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  pointTo: "self",
  paymentMethod: "bkash",
  retailPrice: "",
  wholesaleCost: "",
  status: "active",
  expiresAt: "",
};

export function DomainFormModal({
  open,
  onClose,
  itemId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  itemId?: string;
  initial?: DomainFormValues;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<DomainFormValues>(initial ?? EMPTY);
  const [error, setError] = useState("");

  const set = (patch: Partial<DomainFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const input: DomainRecordInput = {
        domainName: values.domainName,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        customerEmail: values.customerEmail || undefined,
        pointTo: values.pointTo,
        paymentMethod: values.paymentMethod,
        retailPrice: Number(values.retailPrice) || 0,
        wholesaleCost: values.wholesaleCost ? Number(values.wholesaleCost) : undefined,
        status: values.status,
        expiresAt: values.expiresAt || undefined,
      };
      const res = itemId ? await updateDomainRecordAction(itemId, input) : await createManualDomainAction(input);
      if ("error" in res) return setError(res.error);
      toast(itemId ? "Saved" : "Added", "success");
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={itemId ? "Edit domain record" : "Add a domain record"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Domain name">
            <Input required value={values.domainName} onChange={(e) => set({ domainName: e.target.value })} placeholder="example.com" />
          </Field>
          <Field label="Status">
            <Select value={values.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Customer name">
            <Input required value={values.customerName} onChange={(e) => set({ customerName: e.target.value })} />
          </Field>
          <Field label="Customer phone">
            <Input required value={values.customerPhone} onChange={(e) => set({ customerPhone: e.target.value })} placeholder="01XXXXXXXXX" />
          </Field>
          <Field label="Customer email (optional)">
            <Input type="email" value={values.customerEmail} onChange={(e) => set({ customerEmail: e.target.value })} />
          </Field>
          <Field label="Payment method">
            <Select value={values.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as "bkash" | "nagad" })}>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
            </Select>
          </Field>
          <Field label="Points to">
            <Select value={values.pointTo} onChange={(e) => set({ pointTo: e.target.value as "self" | "zotomic" })}>
              <option value="self">Customer manages DNS</option>
              <option value="zotomic">A Zotomic store</option>
            </Select>
          </Field>
          <Field label="Expires on (optional)">
            <Input type="date" value={values.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} />
          </Field>
          <Field label="Retail price (৳)">
            <Input required type="number" min="0" step="1" value={values.retailPrice} onChange={(e) => set({ retailPrice: e.target.value })} />
          </Field>
          <Field label="Wholesale cost (USD, optional — for your own margin tracking)">
            <Input type="number" min="0" step="0.01" value={values.wholesaleCost} onChange={(e) => set({ wholesaleCost: e.target.value })} />
          </Field>
        </div>

        {error && <p className="rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : itemId ? "Save changes" : "Add domain"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
