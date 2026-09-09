"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Trash2, ShieldBan, Search } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createUser, blockIp, unblockIp } from "./actions";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  state: "active" | "suspended" | "blocked";
  businesses: string[];
  lastLogin: string;
  lastIp: string;
  joined: string;
}
export interface BlockedIp {
  id: string;
  ip: string;
  reason: string;
  at: string;
}

const STATE_TONE = { active: "success", suspended: "warning", blocked: "danger" } as const;

export function UsersClient({ rows, blockedIps }: { rows: UserRow[]; blockedIps: BlockedIp[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [state, setState] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newPw, setNewPw] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (role && r.role !== role) return false;
      if (state && r.state !== state) return false;
      if (t && !`${r.name} ${r.email} ${r.lastIp} ${r.businesses.join(" ")}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [rows, q, role, state]);

  const cols: Column<UserRow>[] = [
    {
      key: "name",
      header: "User",
      render: (r) => (
        <Link href={`/admin/users/${r.id}`} className="group flex items-center gap-1.5">
          <span>
            <span className="block font-medium text-fg group-hover:text-primary">{r.name}</span>
            <span className="block text-xs text-fg-subtle">{r.email}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle group-hover:text-primary" />
        </Link>
      ),
    },
    { key: "role", header: "Role", render: (r) => <Badge tone={r.role === "admin" ? "primary" : "neutral"}>{r.role}</Badge> },
    { key: "state", header: "Status", render: (r) => <Badge tone={STATE_TONE[r.state]}>{r.state}</Badge> },
    {
      key: "businesses",
      header: "Stores",
      render: (r) => (r.businesses.length ? r.businesses.join(", ") : <span className="text-fg-subtle">—</span>),
    },
    { key: "lastIp", header: "Last IP", render: (r) => <span className="font-mono text-xs">{r.lastIp}</span> },
    { key: "lastLogin", header: "Last login", align: "right", render: (r) => r.lastLogin },
  ];

  const submitAdd = (form: FormData) =>
    start(async () => {
      const res = await createUser({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        role: String(form.get("role") ?? "owner"),
        password: String(form.get("password") ?? "") || undefined,
      });
      if ("error" in res) return toast(res.error, "error");
      setAddOpen(false);
      setNewPw(res.password);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-fg">Users &amp; Roles</h1>
          <p className="mt-1 text-sm text-fg-muted">{rows.length} users</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add user
        </Button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, IP, store…"
              className="h-9 w-full rounded-sm border border-border bg-surface pl-8 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="max-w-[140px]">
            <option value="">All roles</option>
            <option value="owner">Owner</option>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </Select>
          <Select value={state} onChange={(e) => setState(e.target.value)} className="max-w-[150px]">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="blocked">Blocked</option>
          </Select>
        </div>
      </Card>

      <Card>
        <DataTable columns={cols} rows={filtered} rowKey={(r) => r.id} empty={{ title: "No users match" }} />
      </Card>

      {/* Blocked IPs */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <ShieldBan className="h-4 w-4 text-danger" /> Blocked IPs ({blockedIps.length})
            </span>
          </CardTitle>
        </CardHeader>
        <div className="space-y-3 px-4 py-4">
          <form
            action={(f) =>
              start(async () => {
                const res = await blockIp(String(f.get("ip") ?? ""), String(f.get("reason") ?? ""));
                if ("error" in res) return toast(res.error, "error");
                toast("IP blocked", "success");
                router.refresh();
              })
            }
            className="flex flex-wrap gap-2"
          >
            <Input name="ip" placeholder="203.0.113.4 or 203.0.113.0/24" className="max-w-[240px]" />
            <Input name="reason" placeholder="Reason (optional)" className="max-w-[220px]" />
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              Block IP
            </Button>
          </form>
          {blockedIps.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {blockedIps.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="font-mono text-fg">{b.ip}</span>
                    {b.reason && <span className="ml-2 text-xs text-fg-subtle">{b.reason}</span>}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-fg-subtle">
                    {b.at}
                    <button
                      onClick={() => start(async () => {
                        await unblockIp(b.id);
                        toast("Unblocked", "success");
                        router.refresh();
                      })}
                      className="text-fg-subtle hover:text-danger"
                      aria-label="Unblock"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Add user modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add user">
        <form action={submitAdd} className="space-y-3">
          <Field label="Name">
            <Input name="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select name="role" defaultValue="owner">
                <option value="owner">Owner</option>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Password" hint="blank = auto-generate">
              <Input name="password" placeholder="Auto" />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              Create user
            </Button>
          </div>
        </form>
      </Modal>

      {/* Show generated password once */}
      <Modal open={!!newPw} onClose={() => setNewPw(null)} title="User created">
        <p className="text-sm text-fg-muted">Share this password with the user. It won&apos;t be shown again.</p>
        <p className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg">{newPw}</p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => setNewPw(null)}>
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}
