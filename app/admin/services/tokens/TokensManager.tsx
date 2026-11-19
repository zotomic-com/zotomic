"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { ServiceToken } from "@/lib/services/tool-tokens";
import {
  createServiceTokenAction,
  updateServiceTokenAction,
  deleteServiceTokenAction,
  revealServiceTokenAction,
} from "../actions";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function CreateForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [userEmail, setUserEmail] = useState("");
  const [label, setLabel] = useState("");
  const [services, setServices] = useState<"all" | "both" | "downloader" | "text_to_audio" | "video_generator" | "screenshot_organizer">("all");
  const [dailyLimit, setDailyLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [issued, setIssued] = useState<{ token: string; email: string } | null>(null);

  const create = () =>
    start(async () => {
      const res = await createServiceTokenAction({
        userEmail,
        label: label || undefined,
        services,
        dailyLimit: dailyLimit ? Number(dailyLimit) : null,
        expiresAt: expiresAt || null,
      });
      if (!res.ok || !res.token) {
        toast(res.error ?? "Could not create token", "error");
        return;
      }
      setIssued({ token: res.token, email: userEmail.trim().toLowerCase() });
      setUserEmail("");
      setLabel("");
      setDailyLimit("");
      setExpiresAt("");
      router.refresh();
    });

  return (
    <Card>
      <CardBody className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-bold text-fg">
          <Plus className="h-4 w-4 text-primary" /> Issue a new token
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="User email" hint="The Zotomic account this token belongs to">
            <Input
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="user@example.com"
              type="email"
            />
          </Field>
          <Field label="Label (optional)">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Priya — mobile app" />
          </Field>
          <Field label="Services">
            <Select value={services} onChange={(e) => setServices(e.target.value as typeof services)}>
              <option value="all">All tools</option>
              <option value="both">Downloader + Text to Audio</option>
              <option value="downloader">Online Downloader only</option>
              <option value="text_to_audio">Text to Audio only</option>
              <option value="video_generator">Video Generator only</option>
              <option value="screenshot_organizer">Screenshot Organizer only</option>
              <option value="converter">Converter only</option>
            </Select>
          </Field>
          <Field label="Daily limit (optional)" hint="Leave empty to follow the user's plan">
            <Input
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 50"
              inputMode="numeric"
            />
          </Field>
          <Field label="Expires at (optional)">
            <Input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} type="date" />
          </Field>
        </div>
        <div>
          <Button onClick={create} disabled={pending || !userEmail.trim()}>
            {pending ? "Creating…" : "Generate token"}
          </Button>
        </div>
        {issued && (
          <div className="rounded-lg border border-primary bg-primary-soft p-3">
            <p className="text-xs font-semibold text-fg">
              Token issued for {issued.email} — copy it now, this full value is shown once here:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-surface px-3 py-2 text-xs font-mono text-fg">
                {issued.token}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(issued.token).then(
                    () => toast("Token copied", "success"),
                    () => toast("Copy failed", "error"),
                  );
                }}
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TokenRow({ token }: { token: ServiceToken }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    label: token.label ?? "",
    services: token.services,
    dailyLimit: token.dailyLimit?.toString() ?? "",
    expiresAt: token.expiresAt ? token.expiresAt.slice(0, 10) : "",
  });

  const reveal = () =>
    start(async () => {
      const full = await revealServiceTokenAction(token.id);
      if (!full) {
        toast("Could not reveal token", "error");
        return;
      }
      setValue(full);
      setRevealed(true);
    });

  const save = () =>
    start(async () => {
      const res = await updateServiceTokenAction(token.id, {
        label: draft.label || null,
        services: draft.services,
        dailyLimit: draft.dailyLimit ? Number(draft.dailyLimit) : null,
        expiresAt: draft.expiresAt || null,
      });
      if (!res.ok) {
        toast(res.error ?? "Save failed", "error");
        return;
      }
      toast("Token updated", "success");
      setEditing(false);
      router.refresh();
    });

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            <KeyRound className="h-4 w-4 text-primary" />
            {token.prefix}••••••••••••••••
            <Badge tone={token.status === "active" ? "success" : "danger"}>{token.status}</Badge>
            <Badge tone={token.services === "both" ? "info" : "neutral"}>
              {token.services === "both" ? "both tools" : token.services === "all" ? "all tools" : token.services.replace("_", " ")}
            </Badge>
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {token.userEmail}
            {token.label ? ` · ${token.label}` : ""} · limit {token.dailyLimit ?? "plan default"} · used{" "}
            {token.usageCount}× · last {fmtDate(token.lastUsedAt)} · expires {fmtDate(token.expiresAt)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={reveal} disabled={pending}>
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {revealed ? "Hide" : "Reveal"}
          </Button>
          {revealed && value && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigator.clipboard.writeText(value).then(
                  () => toast("Token copied", "success"),
                  () => toast("Copy failed", "error"),
                )
              }
            >
              <Copy className="h-4 w-4" /> Copy
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            Edit
          </Button>
          {token.status === "active" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await updateServiceTokenAction(token.id, { status: "revoked" });
                  toast("Token revoked", "success");
                  router.refresh();
                })
              }
            >
              <RotateCcw className="h-4 w-4" /> Revoke
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await updateServiceTokenAction(token.id, { status: "active" });
                  toast("Token re-activated", "success");
                  router.refresh();
                })
              }
            >
              <RotateCcw className="h-4 w-4" /> Re-activate
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this token permanently?")) return;
              start(async () => {
                await deleteServiceTokenAction(token.id);
                toast("Token deleted", "success");
                router.refresh();
              });
            }}
          >
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      </div>

      {revealed && value && (
        <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-surface-2 px-3 py-2 text-xs font-mono text-fg">
          {value}
        </code>
      )}

      {editing && (
        <div className="mt-3 grid gap-3 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-2">
          <Field label="Label">
            <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </Field>
          <Field label="Services">
            <Select
              value={draft.services}
              onChange={(e) => setDraft({ ...draft, services: e.target.value as typeof draft.services })}
            >
              <option value="all">All tools</option>
              <option value="both">Downloader + Text to Audio</option>
              <option value="downloader">Online Downloader only</option>
              <option value="text_to_audio">Text to Audio only</option>
              <option value="video_generator">Video Generator only</option>
              <option value="screenshot_organizer">Screenshot Organizer only</option>
              <option value="converter">Converter only</option>
            </Select>
          </Field>
          <Field label="Daily limit" hint="Empty = follow the user's plan">
            <Input
              value={draft.dailyLimit}
              onChange={(e) => setDraft({ ...draft, dailyLimit: e.target.value.replace(/[^0-9]/g, "") })}
              inputMode="numeric"
            />
          </Field>
          <Field label="Expires at">
            <Input
              value={draft.expiresAt}
              onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
              type="date"
            />
          </Field>
          <div className="sm:col-span-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function TokensManager({ tokens }: { tokens: ServiceToken[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) => t.userEmail.includes(q) || (t.label ?? "").toLowerCase().includes(q) || t.prefix.includes(q),
    );
  }, [tokens, query]);

  return (
    <div className="space-y-4">
      <CreateForm />
      <Card>
        <CardBody className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-fg">Issued tokens ({tokens.length})</p>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email, label or prefix…"
              className="w-full sm:w-72"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              No tokens yet — issue the first one above.
            </p>
          ) : (
            <ul className="divide-y divide-border">{filtered.map((t) => <TokenRow key={t.id} token={t} />)}</ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
