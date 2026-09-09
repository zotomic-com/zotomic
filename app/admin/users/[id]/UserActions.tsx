"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  updateUser,
  setUserStatus,
  setUserBlocked,
  resetUserPassword,
  deleteUser,
  impersonateUser,
} from "../actions";

interface U {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  blocked: boolean;
  lastIp: string | null;
}

export function UserActions({ user, isSelf }: { user: U; isSelf: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [modal, setModal] = useState<null | "edit" | "block" | "delete">(null);
  const [pw, setPw] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string } | { ok?: unknown }>, ok = "Done") =>
    start(async () => {
      const res = (await fn()) as { error?: string };
      if (res?.error) return toast(res.error, "error");
      toast(ok, "success");
      setModal(null);
      router.refresh();
    });

  const suspended = user.status === "suspended";

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setModal("edit")}>
        Edit
      </Button>

      {!isSelf && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => setUserStatus(user.id, suspended ? "active" : "suspended"), suspended ? "Unsuspended" : "Suspended")}
        >
          {suspended ? "Unsuspend" : "Suspend"}
        </Button>
      )}

      {!isSelf &&
        (user.blocked ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => setUserBlocked(user.id, false), "Unblocked")}
          >
            Unblock
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={() => setModal("block")}>
            Block
          </Button>
        ))}

      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await resetUserPassword(user.id);
            if ("error" in res) return toast(res.error, "error");
            setPw(res.password);
          })
        }
      >
        Reset password
      </Button>

      {!isSelf && user.role !== "admin" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await impersonateUser(user.id);
              if ("error" in res) return toast(res.error, "error");
              window.location.href = res.redirect;
            })
          }
        >
          Sign in as
        </Button>
      )}

      {!isSelf && (
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setModal("delete")}>
          Delete
        </Button>
      )}

      {/* Edit */}
      <Modal open={modal === "edit"} onClose={() => setModal(null)} title="Edit user">
        <form
          action={(f) =>
            run(
              () =>
                updateUser(user.id, {
                  name: String(f.get("name") ?? ""),
                  email: String(f.get("email") ?? ""),
                  role: String(f.get("role") ?? user.role),
                  notes: String(f.get("notes") ?? ""),
                }),
              "Saved",
            )
          }
          className="space-y-3"
        >
          <Field label="Name">
            <Input name="name" defaultValue={user.name} required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={user.email} required />
          </Field>
          <Field label="Role">
            <Select name="role" defaultValue={user.role} disabled={isSelf}>
              <option value="owner">Owner</option>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Internal notes">
            <Textarea name="notes" rows={2} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Block */}
      <Modal open={modal === "block"} onClose={() => setModal(null)} title={`Block ${user.name}`}>
        <form
          action={(f) =>
            run(
              () =>
                setUserBlocked(user.id, true, {
                  reason: String(f.get("reason") ?? ""),
                  alsoBlockIp: f.get("blockip") === "on",
                }),
              "Blocked",
            )
          }
          className="space-y-3"
        >
          <p className="text-sm text-fg-muted">
            The user can&apos;t sign in and any active session ends on the next request.
          </p>
          <Field label="Reason (shown to the user)">
            <Input name="reason" placeholder="Abuse / fraud / chargeback" />
          </Field>
          {user.lastIp && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="blockip" />
              Also block their last IP <span className="font-mono text-xs text-fg-subtle">{user.lastIp}</span>
            </label>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="danger" disabled={pending}>
              Block user
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete */}
      <Modal open={modal === "delete"} onClose={() => setModal(null)} title={`Delete ${user.name}`}>
        <form
          action={(f) => run(() => deleteUser(user.id, String(f.get("confirm") ?? "")), "Deleted")}
          className="space-y-3"
        >
          <p className="text-sm text-fg-muted">
            This permanently removes the account. Type <span className="font-mono text-fg">{user.email}</span> to confirm.
          </p>
          <Input name="confirm" placeholder={user.email} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="danger" disabled={pending}>
              Delete permanently
            </Button>
          </div>
        </form>
      </Modal>

      {/* Password reveal */}
      <Modal open={!!pw} onClose={() => setPw(null)} title="New password">
        <p className="text-sm text-fg-muted">Share this with the user. It won&apos;t be shown again.</p>
        <p className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg">{pw}</p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => setPw(null)}>
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}
