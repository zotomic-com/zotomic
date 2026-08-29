"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAddressAction, logoutAction, saveAddressAction, updateProfileAction } from "./actions";

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
  "w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 py-2 text-sm";
const btn = "rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";
const ghost = "rounded-[var(--sf-radius)] border border-[var(--sf-line)] px-4 py-2 text-sm font-semibold";

export function AccountClient({
  slug,
  basePath,
  profile,
  addresses,
}: {
  slug: string;
  basePath: string;
  profile: { name: string; email: string; phone: string };
  addresses: Address[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const doAction = (fn: () => Promise<{ error?: string; ok?: boolean }>) =>
    start(async () => {
      await fn();
      setEditing(null);
      router.refresh();
    });

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">Profile</h2>
        <form
          action={(fd) => doAction(() => updateProfileAction(slug, fd))}
          className="grid gap-3 sm:grid-cols-2"
        >
          <input name="name" defaultValue={profile.name} placeholder="Name" className={input} />
          <input name="phone" defaultValue={profile.phone} placeholder="Phone" className={input} />
          <p className="text-xs text-[var(--sf-muted)] sm:col-span-2">{profile.email}</p>
          <div className="sm:col-span-2">
            <button className={btn} disabled={pending}>
              Save profile
            </button>
          </div>
        </form>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--sf-muted)]">Addresses</h2>
          {editing !== "new" && (
            <button className={ghost} onClick={() => setEditing("new")}>
              Add address
            </button>
          )}
        </div>

        <div className="space-y-3">
          {editing === "new" && (
            <AddressForm slug={slug} onDone={() => setEditing(null)} pending={pending} runAction={doAction} />
          )}
          {addresses.map((a) =>
            editing === a.id ? (
              <AddressForm
                key={a.id}
                slug={slug}
                address={a}
                pending={pending}
                runAction={doAction}
                onDone={() => setEditing(null)}
              />
            ) : (
              <div key={a.id} className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {a.label || "Address"}
                      {a.is_default && <span className="ml-2 text-xs text-[var(--sf-accent)]">Default</span>}
                    </p>
                    <p className="text-[var(--sf-muted)]">
                      {[a.name, a.phone].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-[var(--sf-muted)]">
                      {[a.address, a.area, a.city].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <button onClick={() => setEditing(a.id)} className="font-semibold">
                      Edit
                    </button>
                    <button
                      onClick={() => doAction(() => deleteAddressAction(slug, a.id))}
                      className="font-semibold text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ),
          )}
          {addresses.length === 0 && editing !== "new" && (
            <p className="text-sm text-[var(--sf-muted)]">No saved addresses.</p>
          )}
        </div>
      </section>

      <button
        onClick={() =>
          start(async () => {
            await logoutAction();
            router.push(basePath || "/");
            router.refresh();
          })
        }
        className={ghost}
      >
        Sign out
      </button>
    </div>
  );
}

function AddressForm({
  slug,
  address,
  pending,
  runAction,
  onDone,
}: {
  slug: string;
  address?: Address;
  pending: boolean;
  runAction: (fn: () => Promise<{ error?: string; ok?: boolean }>) => void;
  onDone: () => void;
}) {
  return (
    <form
      action={(fd) => runAction(() => saveAddressAction(slug, fd))}
      className="grid gap-2 rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-3 sm:grid-cols-2"
    >
      {address && <input type="hidden" name="id" value={address.id} />}
      <input name="label" defaultValue={address?.label ?? ""} placeholder="Label (Home, Office)" className={input} />
      <input name="name" defaultValue={address?.name ?? ""} placeholder="Recipient name" className={input} />
      <input name="phone" defaultValue={address?.phone ?? ""} placeholder="Phone" className={input} />
      <input name="city" defaultValue={address?.city ?? ""} placeholder="City" className={input} />
      <input name="area" defaultValue={address?.area ?? ""} placeholder="Area / Thana" className={input} />
      <input
        name="address"
        defaultValue={address?.address ?? ""}
        placeholder="Street address"
        className={`${input} sm:col-span-2`}
      />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="is_default" defaultChecked={address?.is_default} /> Default address
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button className={btn} disabled={pending}>
          Save
        </button>
        <button type="button" onClick={onDone} className={ghost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
