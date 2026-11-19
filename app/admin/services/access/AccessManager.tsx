"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { ServiceAccessRow } from "@/lib/services/tool-access";
import { upsertServiceAccessAction, deleteServiceAccessAction } from "../actions";

const MODE_BADGE: Record<ServiceAccessRow["mode"], "success" | "info" | "danger"> = {
  allow: "success",
  plan: "info",
  block: "danger",
};

const SERVICE_LABEL: Record<string, string> = {
  downloader: "Downloader",
  text_to_audio: "Text to Audio",
  video_generator: "Video Generator",
  screenshot_organizer: "Screenshot Organizer",
  converter: "Converter",
};

function CreateForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [userEmail, setUserEmail] = useState("");
  const [service, setService] = useState<
    "all" | "both" | "downloader" | "text_to_audio" | "video_generator" | "screenshot_organizer" | "converter"
  >("all");
  const [mode, setMode] = useState<"plan" | "allow" | "block">("allow");
  const [dailyLimit, setDailyLimit] = useState("");
  const [maxQuality, setMaxQuality] = useState("");
  const [note, setNote] = useState("");

  const create = () =>
    start(async () => {
      const res = await upsertServiceAccessAction({
        userEmail,
        service,
        mode,
        dailyLimit: dailyLimit ? Number(dailyLimit) : null,
        maxQuality: maxQuality || null,
        note: note || null,
      });
      if (!res.ok) {
        toast(res.error ?? "Could not save", "error");
        return;
      }
      toast("Access rule saved", "success");
      setUserEmail("");
      setDailyLimit("");
      setMaxQuality("");
      setNote("");
      router.refresh();
    });

  return (
    <Card>
      <CardBody className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-bold text-fg">
          <Plus className="h-4 w-4 text-primary" /> Set access
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="User email(s)" hint="One or more emails, comma-separated">
            <Input
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="user@example.com, other@example.com"
            />
          </Field>
          <Field label="Service">
            <Select value={service} onChange={(e) => setService(e.target.value as typeof service)}>
              <option value="all">All tools</option>
              <option value="both">Downloader + Text to Audio</option>
              <option value="downloader">Online Downloader</option>
              <option value="text_to_audio">Text to Audio</option>
              <option value="video_generator">Video Generator</option>
              <option value="screenshot_organizer">Screenshot Organizer</option>
              <option value="converter">Converter</option>
            </Select>
          </Field>
          <Field label="Access mode" hint="allow = explicit grant · plan = follow subscription · block = deny">
            <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="allow">Allow (with custom limit)</option>
              <option value="plan">Follow plan</option>
              <option value="block">Block</option>
            </Select>
          </Field>
          {mode === "allow" && (
            <>
              <Field label="Daily limit" hint="Successful calls per day (required for grants)">
                <Input
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="e.g. 50"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Max quality (optional)" hint="Downloader only — e.g. 720 or 1080">
                <Input
                  value={maxQuality}
                  onChange={(e) => setMaxQuality(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="e.g. 1080"
                  inputMode="numeric"
                />
              </Field>
            </>
          )}
          {mode !== "allow" && (
            <Field label="Note (optional)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / context" />
            </Field>
          )}
        </div>
        <div>
          <Button onClick={create} disabled={pending || !userEmail.trim()}>
            {pending ? "Saving…" : "Save access rule"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function AccessRowItem({ row }: { row: ServiceAccessRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
          {row.userEmail}
          <Badge tone={MODE_BADGE[row.mode]}>{row.mode}</Badge>
          <Badge tone="neutral">{SERVICE_LABEL[row.service] ?? row.service}</Badge>
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          {row.mode === "allow"
            ? `limit ${row.dailyLimit ?? "—"} / day${row.maxQuality ? ` · max ${row.maxQuality}p` : ""}`
            : row.mode === "block"
              ? "denied"
              : "follows subscription plan"}
          {row.note ? ` · ${row.note}` : ""}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Remove this access rule for ${row.userEmail}? They will fall back to their plan.`)) return;
          start(async () => {
            await deleteServiceAccessAction(row.id);
            toast("Access rule removed", "success");
            router.refresh();
          });
        }}
      >
        <Trash2 className="h-4 w-4 text-danger" /> Remove
      </Button>
    </li>
  );
}

export default function AccessManager({ rows }: { rows: ServiceAccessRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.userEmail.includes(q) || r.service.includes(q) || r.mode.includes(q));
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <CreateForm />
      <Card>
        <CardBody className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-fg">Access rules ({rows.length})</p>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email or service…"
              className="w-full sm:w-72"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              No custom rules — everyone falls back to their plan&apos;s limits.
            </p>
          ) : (
            <ul className="divide-y divide-border">{filtered.map((r) => <AccessRowItem key={r.id} row={r} />)}</ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
