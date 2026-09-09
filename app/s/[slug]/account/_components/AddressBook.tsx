"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus } from "lucide-react";
import { deleteAddressAction, saveAddressAction } from "../actions";

export interface Address {
  id: string;
  label: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  area: string | null;
  is_default: boolean;
}

const input =
  "w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--sf-accent)]";
const btn = "rounded-full bg-[var(--sf-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60";
const ghost = "rounded-full border border-[var(--sf-line)] px-4 py-2.5 text-sm font-semibold";

export function AddressBook({ slug, addresses }: { slug: string; addresses: Address[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(addresses.length ? null : "new");

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      setEditing(null);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">Saved addresses</h2>
        {editing !== "new" && (
          <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sf-accent)]">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {editing === "new" && <AddressForm slug={slug} pending={pending} onSave={run} onCancel={() => setEditing(null)} />}

      {addresses.map((a) =>
        editing === a.id ? (
          <AddressForm key={a.id} slug={slug} address={a} pending={pending} onSave={run} onCancel={() => setEditing(null)} />
        ) : (
          <div key={a.id} className="rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sf-muted)]" />
                <div>
                  <p className="font-semibold">
                    {a.label || "Address"}
                    {a.is_default && (
                      <span className="ml-2 rounded-full bg-[var(--sf-accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--sf-accent)]">
                        Default
                      </span>
                    )}
                  </p>
                  <p className="text-[var(--sf-muted)]">{[a.name, a.phone].filter(Boolean).join(" · ")}</p>
                  <p className="text-[var(--sf-muted)]">{[a.address, a.area, a.city].filter(Boolean).join(", ")}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-3 text-xs font-semibold">
                <button onClick={() => setEditing(a.id)}>Edit</button>
                <button onClick={() => run(() => deleteAddressAction(slug, a.id))} className="text-red-600">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ),
      )}

      {addresses.length === 0 && editing !== "new" && (
        <p className="rounded-[var(--sf-radius-lg)] border border-dashed border-[var(--sf-line)] p-6 text-center text-sm text-[var(--sf-muted)]">
          No saved addresses yet.
        </p>
      )}
    </div>
  );
}

function AddressForm({
  slug,
  address,
  pending,
  onSave,
  onCancel,
}: {
  slug: string;
  address?: Address;
  pending: boolean;
  onSave: (fn: () => Promise<unknown>) => void;
  onCancel: () => void;
}) {
  return (
    <form
      action={(fd) => onSave(() => saveAddressAction(slug, fd))}
      className="grid gap-2.5 rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] p-4 sm:grid-cols-2"
    >
      {address && <input type="hidden" name="id" value={address.id} />}
      <input name="label" defaultValue={address?.label ?? ""} placeholder="Label (Home, Office)" className={input} />
      <input name="name" defaultValue={address?.name ?? ""} placeholder="Recipient name" className={input} />
      <input name="phone" defaultValue={address?.phone ?? ""} placeholder="Phone" className={input} inputMode="tel" />
      <input name="city" defaultValue={address?.city ?? ""} placeholder="City" className={input} />
      <input name="area" defaultValue={address?.area ?? ""} placeholder="Area / Thana" className={input} />
      <textarea
        name="address"
        defaultValue={address?.address ?? ""}
        placeholder="Street address"
        rows={2}
        className={`${input} sm:col-span-2`}
      />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="is_default" defaultChecked={address?.is_default} className="h-4 w-4 accent-[var(--sf-accent)]" />
        Use as my default address
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button className={btn} disabled={pending}>
          {pending ? "Saving…" : "Save address"}
        </button>
        <button type="button" onClick={onCancel} className={ghost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
