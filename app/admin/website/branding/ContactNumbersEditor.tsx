"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, MessageCircle, Phone, Plus, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { ContactNumber, ContactNumberInput, ContactNumberType } from "@/lib/contact-numbers";
import {
  createContactNumberAction,
  updateContactNumberAction,
  deleteContactNumberAction,
  reorderContactNumberAction,
} from "../actions";

const EMPTY: ContactNumberInput = { type: "phone", label: "", number: "" };

function ContactFields({ draft, onChange }: { draft: ContactNumberInput; onChange: (patch: Partial<ContactNumberInput>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[130px_1fr_1fr]">
      <Field label="Type">
        <Select value={draft.type} onChange={(e) => onChange({ type: e.target.value as ContactNumberType })}>
          <option value="phone">Phone</option>
          <option value="whatsapp">WhatsApp</option>
        </Select>
      </Field>
      <Field label="Label">
        <Input value={draft.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="e.g. Sales" />
      </Field>
      <Field label="Number" hint="Include the country code, e.g. +8801XXXXXXXXX">
        <Input value={draft.number} onChange={(e) => onChange({ number: e.target.value })} placeholder="+8801XXXXXXXXX" />
      </Field>
    </div>
  );
}

function ExistingRow({ contact, index, total }: { contact: ContactNumber; index: number; total: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<ContactNumberInput>({ type: contact.type, label: contact.label, number: contact.number });
  const Icon = draft.type === "whatsapp" ? MessageCircle : Phone;
  const refresh = () => router.refresh();

  const save = () =>
    start(async () => {
      await updateContactNumberAction(contact.id, draft);
      toast("Saved", "success");
      refresh();
    });

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Icon className="h-4 w-4 text-primary" />
            {contact.label}
          </span>
          <span className="flex items-center gap-1 text-fg-subtle">
            <button
              onClick={() => start(async () => { await reorderContactNumberAction(contact.id, "up"); refresh(); })}
              disabled={pending || index === 0}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => start(async () => { await reorderContactNumberAction(contact.id, "down"); refresh(); })}
              disabled={pending || index === total - 1}
              className="disabled:opacity-30 hover:text-fg"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (!confirm(`Delete "${contact.label}"?`)) return;
                start(async () => {
                  await deleteContactNumberAction(contact.id);
                  toast("Deleted", "success");
                  refresh();
                });
              }}
              disabled={pending}
              className="hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        </div>
        <ContactFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={save}>
            Save
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function ContactNumbersEditor({ contacts }: { contacts: ContactNumber[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<ContactNumberInput>(EMPTY);
  const [adding, setAdding] = useState(false);

  const add = () =>
    start(async () => {
      const res = await createContactNumberAction(draft);
      if ("error" in res) return toast(res.error, "error");
      toast("Added", "success");
      setDraft(EMPTY);
      setAdding(false);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {contacts.map((c, i) => (
        <ExistingRow key={c.id} contact={c} index={i} total={contacts.length} />
      ))}
      {contacts.length === 0 && <p className="text-sm text-fg-subtle">No contact numbers yet.</p>}

      {adding ? (
        <Card>
          <CardBody className="space-y-3">
            <ContactFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setDraft(EMPTY); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !draft.label.trim() || !draft.number.trim()} onClick={add}>
                Add number
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add a phone or WhatsApp number
        </Button>
      )}
    </div>
  );
}
