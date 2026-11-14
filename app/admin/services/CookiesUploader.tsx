"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Cookie, RefreshCw, UploadCloud } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  uploadEngineCookiesAction,
  engineCookiesStatusAction,
} from "./actions";

interface DeployInfo {
  id: string;
  status: string;
  commit: string | null;
  createdAt: string;
}

/**
 * Admin card: upload a fresh cookies.txt for the download engine's YouTube
 * bot-check workaround. Saving automatically updates the YTDLP_COOKIES env
 * var on Render and starts a deploy — no manual dashboard steps.
 */
export default function CookiesUploader() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, startTransition] = useTransition();
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [deploy, setDeploy] = useState<DeployInfo | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);

  const refresh = () => {
    startTransition(async () => {
      const s = await engineCookiesStatusAction();
      setConfigured(s.configured);
      setDeploy(s.deploy ?? null);
      if (s.error) setMessage({ kind: "info", text: s.error });
      setChecking(false);
    });
  };

  useEffect(refresh, []);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) {
      setMessage({ kind: "error", text: "That file is too large for a cookies.txt (500 KB max)." });
      return;
    }
    setMessage({ kind: "info", text: `Uploading ${file.name}…` });
    const reader = new FileReader();
    reader.onload = () => {
      startTransition(async () => {
        const res = await uploadEngineCookiesAction(String(reader.result ?? ""));
        if (res.ok) {
          setMessage({ kind: "ok", text: "Cookies saved — the engine is redeploying with them (takes a few minutes)." });
          if (fileRef.current) fileRef.current.value = "";
        } else {
          setMessage({ kind: "error", text: res.error ?? "Upload failed." });
        }
        // deploy list needs a beat to include the new deploy
        setTimeout(refresh, 3000);
      });
    };
    reader.readAsText(file);
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-bold text-fg">
            <Cookie className="h-4 w-4 text-primary" /> Engine YouTube cookies
          </p>
          <div className="flex items-center gap-2">
            {checking ? (
              <Badge tone="neutral">checking…</Badge>
            ) : configured ? (
              <Badge tone="success">cookies installed</Badge>
            ) : (
              <Badge tone="danger">not configured</Badge>
            )}
            <button className="text-xs text-fg-muted hover:text-fg" onClick={refresh} type="button">
              <RefreshCw className="mr-1 inline h-3 w-3" /> refresh
            </button>
          </div>
        </div>

        <p className="text-xs text-fg-muted">
          YouTube sometimes asks the download engine (a datacenter server) to prove it is not a bot.
          A cookies.txt file from a logged-in youtube.com session fixes that. When it stops working
          again (sessions expire), export a new one and upload it here — the backend updates the
          engine and redeploys automatically.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            <UploadCloud className="h-4 w-4" /> Upload cookies.txt
          </Button>
          {deploy && (
            <span className="text-xs text-fg-muted">
              Last deploy: <span className="font-mono">{deploy.commit ?? deploy.id.slice(0, 8)}</span>{" "}
              · <Badge tone={deploy.status === "live" ? "success" : deploy.status.includes("failed") ? "danger" : "neutral"}>{deploy.status.replace(/_/g, " ")}</Badge>
            </span>
          )}
        </div>

        {message && (
          <p
            className={`rounded-sm border px-3 py-2 text-xs ${
              message.kind === "ok"
                ? "border-success/30 bg-success-soft text-fg"
                : message.kind === "error"
                  ? "border-danger/30 bg-danger-soft text-fg"
                  : "border-border bg-surface-2 text-fg-muted"
            }`}
          >
            {message.text}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
