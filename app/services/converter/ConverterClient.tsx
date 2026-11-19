"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, FileText, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QuotaPanel, type QuotaInfo } from "@/components/site/service-tools";
import type { ConvGroup, ConvType } from "@/lib/services/converter";

const GROUP_ORDER: ConvGroup[] = ["image", "video", "audio"];
const GROUP_LABEL: Record<ConvGroup, string> = { image: "Image", video: "Video", audio: "Audio" };
const GROUP_BLURB: Record<ConvGroup, string> = {
  image: "Photos and PDFs",
  video: "Clips, GIFs, soundtracks",
  audio: "Music, voice, podcasts",
};

interface Props {
  types: ConvType[];
}

type Result =
  | { kind: "file"; url: string; name: string }
  | { kind: "text"; text: string; name: string };

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function defaultOptions(type: ConvType): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const o of type.options) out[o.id] = o.value;
  return out;
}

export default function ConverterClient({ types }: Props) {
  const firstGroup = useMemo<ConvGroup>(() => {
    for (const g of GROUP_ORDER) if (types.some((t) => t.group === g)) return g;
    return "image";
  }, [types]);

  const [group, setGroup] = useState<ConvGroup>(firstGroup);
  const [slug, setSlug] = useState<string>(types.find((t) => t.group === firstGroup)?.slug ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  const active = types.find((t) => t.slug === slug) ?? null;
  const groupTypes = types.filter((t) => t.group === group);

  const loadQuota = useCallback(() => {
    fetch("/api/converter/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.quota && setQuota(d.quota))
      .catch(() => {});
  }, []);

  useEffect(() => {
    alive.current = true;
    loadQuota();
    return () => {
      alive.current = false;
    };
  }, [loadQuota]);

  useEffect(() => {
    if (!active) return;
    setOpts(defaultOptions(active));
    setFiles([]);
    setResult(null);
    setError("");
    setProgress(0);
    setStatus("");
  }, [active]);

  const pickGroup = (g: ConvGroup) => {
    setGroup(g);
    const next = types.find((t) => t.group === g);
    if (next) setSlug(next.slug);
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length || !active) return;
    const list = Array.from(incoming);
    setError("");
    setResult(null);
    setFiles((prev) => (active.multiple ? [...prev, ...list].slice(0, 30) : list.slice(0, 1)));
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const setOption = (id: string, value: string | number) => setOpts((prev) => ({ ...prev, [id]: value }));

  const poll = async (engineUrl: string, jobId: string, ticket: string, fallbackName: string) => {
    const deadline = Date.now() + 15 * 60 * 1000;
    for (;;) {
      if (!alive.current) return;
      if (Date.now() > deadline) throw new Error("Conversion took too long — try a smaller file.");
      await new Promise((r) => setTimeout(r, 1500));
      const r = await fetch(`${engineUrl}/api/progress/${jobId}?t=${encodeURIComponent(ticket)}`);
      if (!r.ok) {
        if (r.status === 404) throw new Error("The engine lost this job — please try again.");
        throw new Error(`Progress check failed (${r.status}).`);
      }
      const job = (await r.json()) as {
        status?: string;
        percent?: number;
        filename?: string;
        error?: string;
        title?: string;
      };
      if (!alive.current) return;
      setProgress(Math.max(5, Math.min(99, Math.round(job.percent ?? 0))));
      if (job.status === "error") throw new Error(job.error || "Conversion failed.");
      if (job.status === "done") {
        setProgress(100);
        setResult({
          kind: "file",
          url: `${engineUrl}/api/file/${jobId}?t=${encodeURIComponent(ticket)}`,
          name: job.filename || fallbackName,
        });
        return;
      }
      setStatus(job.status === "downloading" ? "Uploading your file…" : "Converting…");
    }
  };

  const convert = async () => {
    if (!active || busy) return;
    if (active.needsFile && !files.length) {
      setError("Choose a file first.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setProgress(3);
    setStatus("Starting…");
    let charge: { jobId: string; mode: string } | null = null;
    try {
      const auth = await fetch("/api/converter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: active.slug, options: opts }),
      });
      const data = await auth.json().catch(() => ({}));
      if (!auth.ok) throw new Error(data.error || `Could not start (${auth.status}).`);
      if (data.jobId) charge = { jobId: String(data.jobId), mode: String(data.mode ?? "engine") };

      if (data.mode === "site") {
        const fd = new FormData();
        fd.append("file", files[0]);
        fd.append("language", String(opts.language ?? "auto"));
        setStatus("Transcribing…");
        setProgress(40);
        const r = await fetch("/api/converter/transcribe", { method: "POST", body: fd });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out.error || "Transcription failed.");
        setProgress(100);
        const base = files[0].name.replace(/\.[^.]+$/, "");
        setResult({ kind: "text", text: out.text, name: `${base}.txt` });
        return;
      }

      // Engine upload — the file goes straight to Render, never through Vercel.
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      setStatus("Uploading your file…");
      setProgress(8);
      const up = await fetch(`${data.uploadUrl}?p=${encodeURIComponent(data.ticket)}`, {
        method: "POST",
        body: fd,
      });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(upJson.error || `Upload failed (${up.status}).`);

      const jobId = String(upJson.jobId || data.jobId);
      const base = (files[0]?.name ?? "converted").replace(/\.[^.]+$/, "");
      await poll(data.engineUrl, jobId, data.progressTicket, `${base}-converted`);
    } catch (e) {
      setError((e as Error).message || "Conversion failed.");
      setProgress(0);
      setStatus("");
      // A failed conversion should not cost the user one of their daily credits.
      if (charge) {
        fetch("/api/converter/refund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(charge),
        }).catch(() => {});
      }
    } finally {
      if (alive.current) setBusy(false);
      loadQuota();
    }
  };

  const copyText = async () => {
    if (result?.kind !== "text") return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the text is selectable anyway */
    }
  };

  const downloadText = () => {
    if (result?.kind !== "text") return;
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!types.length) {
    return (
      <Card>
        <CardBody className="text-sm text-fg-muted">
          The converter is being set up. Please check back shortly.
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold text-fg">
              <RefreshCw className="h-4 w-4 text-primary" /> Converter
            </p>
            <QuotaPanel quota={quota} unit="conversions" />
          </div>

          {/* group tabs */}
          <div className="flex flex-wrap gap-2">
            {GROUP_ORDER.map((g) => {
              const count = types.filter((t) => t.group === g).length;
              if (!count) return null;
              const on = g === group;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => pickGroup(g)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    on ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary"
                  }`}
                >
                  <span className={`block text-sm font-bold ${on ? "text-primary" : "text-fg"}`}>
                    {GROUP_LABEL[g]}
                  </span>
                  <span className="block text-[11px] text-fg-subtle">{GROUP_BLURB[g]}</span>
                </button>
              );
            })}
          </div>

          {/* sub-services */}
          <div className="grid gap-2 sm:grid-cols-2">
            {groupTypes.map((t) => {
              const on = t.slug === slug;
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => setSlug(t.slug)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    on ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary"
                  }`}
                >
                  <span className={`block text-sm font-semibold ${on ? "text-primary" : "text-fg"}`}>{t.label}</span>
                  {t.description && <span className="mt-0.5 block text-xs text-fg-muted">{t.description}</span>}
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {active && (
        <Card>
          <CardBody className="space-y-4">
            {/* dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
                dragging ? "border-primary bg-primary-soft" : "border-border bg-surface-2 hover:border-primary"
              }`}
            >
              <Upload className="mx-auto h-6 w-6 text-primary" />
              <p className="mt-2 text-sm font-semibold text-fg">
                {active.multiple ? "Drop files here, or click to choose" : "Drop a file here, or click to choose"}
              </p>
              <p className="mt-1 text-xs text-fg-subtle">
                {active.accept ? active.accept.replace(/,/g, " · ") : "Any file"}
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={active.accept || undefined}
                multiple={active.multiple}
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-fg-subtle" />
                      <span className="truncate text-fg">{f.name}</span>
                      <span className="shrink-0 text-xs text-fg-subtle">{formatBytes(f.size)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* options */}
            {active.options.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {active.options.map((o) => (
                  <div key={o.id}>
                    <label className="text-sm font-medium text-fg">{o.label}</label>
                    {o.type === "select" ? (
                      <select
                        value={String(opts[o.id] ?? o.value)}
                        onChange={(e) => setOption(o.id, e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
                      >
                        {(o.options ?? []).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={o.type === "number" ? "number" : "text"}
                        value={String(opts[o.id] ?? o.value)}
                        min={o.min}
                        max={o.max}
                        step={o.step}
                        onChange={(e) =>
                          setOption(o.id, o.type === "number" ? Number(e.target.value) : e.target.value)
                        }
                        className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            {busy && (
              <div className="space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.max(3, progress)}%` }}
                  />
                </div>
                <p className="text-xs text-fg-muted">{status || "Working…"}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={convert} disabled={busy} size="md">
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Working…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" /> {active.label}
                  </>
                )}
              </Button>
              <span className="text-xs text-fg-subtle">
                Files are processed on our engine and deleted after download.
              </span>
            </div>

            {result?.kind === "file" && (
              <div className="rounded-lg border border-border bg-surface-2 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <Check className="h-4 w-4 text-success" /> Your file is ready
                </p>
                <a
                  href={result.url}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                >
                  <Download className="h-4 w-4" /> Download {result.name}
                </a>
                <p className="mt-2 text-xs text-fg-subtle">
                  Download it now — the engine keeps it for a short while and then deletes it.
                </p>
              </div>
            )}

            {result?.kind === "text" && (
              <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <Check className="h-4 w-4 text-success" /> Transcript ready
                </p>
                <textarea
                  readOnly
                  value={result.text}
                  rows={10}
                  className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyText}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-fg hover:border-primary"
                  >
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy text"}
                  </button>
                  <button
                    type="button"
                    onClick={downloadText}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                  >
                    <Download className="h-4 w-4" /> Download .txt
                  </button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
