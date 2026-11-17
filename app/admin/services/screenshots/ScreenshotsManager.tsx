"use client";

import { useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import {
  loadSessionDataAction,
  updateScreenshotItemAction,
  deleteScreenshotItemAction,
  addScreenshotGroupAction,
  renameScreenshotGroupAction,
  deleteScreenshotGroupAction,
  deleteScreenshotSessionAction,
} from "./actions";

interface SessionSummary {
  id: string;
  title: string;
  owner_email: string | null;
  owner_ip: string | null;
  created_at: string;
  expires_at: string;
  groups: number;
  items: number;
}

interface GroupRow {
  id: string;
  name: string;
}

interface ItemRow {
  id: string;
  group_id: string | null;
  name: string;
  details: string;
  user_link: string;
  analysis: Record<string, unknown>;
  recovered_links: Array<{ url: string; verdict: string; details: string }>;
  status: string;
  error: string | null;
  created_at: string;
}

export default function ScreenshotsManager({ sessions }: { sessions: SessionSummary[] }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [newGroup, setNewGroup] = useState("");

  const load = async (id: string) => {
    setSessionId(id);
    setMsg("");
    if (!id) {
      setGroups([]);
      setItems([]);
      return;
    }
    setBusy(true);
    const r = await loadSessionDataAction(id);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? "Load failed.");
      return;
    }
    setGroups((r.groups ?? []) as GroupRow[]);
    setItems((r.items ?? []) as ItemRow[]);
  };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(true);
    setMsg("");
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? okMsg : (r.error ?? "Failed."));
    if (r.ok && sessionId) await load(sessionId);
  };

  if (!sessions.length) {
    return (
      <Card>
        <CardBody className="py-8 text-center text-sm text-fg-muted">No screenshot sessions in the last 24 hours.</CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <label className="block text-xs font-semibold text-fg-muted">Session</label>
          <select value={sessionId} onChange={(e) => load(e.target.value)} className="w-full max-w-xl rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Select a session…</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.created_at).toISOString().slice(0, 16).replace("T", " ")} — {s.owner_email ?? s.owner_ip ?? "guest"} ({s.items} screenshots)
              </option>
            ))}
          </select>
          {sessionId && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => run(() => deleteScreenshotSessionAction(sessionId), "Session deleted.")}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete whole session
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      {sessionId && (
        <>
          <Card>
            <CardBody className="space-y-3">
              <p className="text-sm font-bold text-fg">Groups ({groups.length})</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm">
                    <input
                      defaultValue={g.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== g.name) run(() => renameScreenshotGroupAction(sessionId, g.id, v), "Group renamed.");
                      }}
                      className="w-32 bg-transparent outline-none"
                    />
                    <button title="Delete group (items kept, ungrouped)" onClick={() => run(() => deleteScreenshotGroupAction(sessionId, g.id), "Group deleted.")} className="text-red-500 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  placeholder="New group name…"
                  className="w-56 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                />
                <button
                  onClick={() => {
                    const n = newGroup.trim();
                    if (!n) return;
                    setNewGroup("");
                    run(() => addScreenshotGroupAction(sessionId, n), "Group added.");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                >
                  <Plus className="h-4 w-4" /> Add group
                </button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <p className="text-sm font-bold text-fg">Screenshots ({items.length})</p>
              {items.map((it) => {
                const a = it.analysis ?? {};
                return (
                  <div key={it.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        defaultValue={it.name}
                        onBlur={(e) => e.target.value.trim() && e.target.value !== it.name && run(() => updateScreenshotItemAction(sessionId, it.id, { name: e.target.value }), "Saved.")}
                        className="min-w-48 flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-sm font-semibold"
                      />
                      <select
                        defaultValue={it.group_id ?? ""}
                        onChange={(e) => run(() => updateScreenshotItemAction(sessionId, it.id, { groupId: e.target.value || null }), "Moved.")}
                        className="rounded border border-border bg-surface-2 px-2 py-1 text-xs"
                      >
                        <option value="">Ungrouped</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      <button title="Delete screenshot" onClick={() => run(() => deleteScreenshotItemAction(sessionId, it.id), "Screenshot deleted.")} className="text-red-500 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input
                        defaultValue={it.user_link}
                        placeholder="Link (empty if none)"
                        onBlur={(e) => e.target.value !== it.user_link && run(() => updateScreenshotItemAction(sessionId, it.id, { link: e.target.value }), "Saved.")}
                        className="rounded border border-border bg-surface-2 px-2 py-1 text-xs"
                      />
                      <input
                        defaultValue={it.details}
                        placeholder="Owner's note"
                        onBlur={(e) => e.target.value !== it.details && run(() => updateScreenshotItemAction(sessionId, it.id, { details: e.target.value }), "Saved.")}
                        className="rounded border border-border bg-surface-2 px-2 py-1 text-xs"
                      />
                    </div>
                    <p className="mt-2 text-xs text-fg-muted">
                      {String(a.key_info ?? "")}
                      {a.sensitive ? " · ⚠ sensitive" : ""}
                      {it.recovered_links.length ? ` · ${it.recovered_links.length} recovered link(s)` : ""}
                    </p>
                    {it.status === "error" && <Badge tone="danger">{it.error ?? "analysis failed"}</Badge>}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </>
      )}

      {busy && <p className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Working…</p>}
      {msg && <p className="text-sm text-fg-muted">{msg}</p>}
    </div>
  );
}
