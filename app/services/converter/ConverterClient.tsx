"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Music,
  RefreshCw,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QuotaPanel, type QuotaInfo } from "@/components/site/service-tools";
import type { ConvGroup, ConvType } from "@/lib/services/converter";
import { buildDocxBlob, saveBlob, saveText } from "@/lib/text-export";

export interface ConvGroupInfo {
  id: ConvGroup;
  label: string;
  blurb: string;
}

interface Props {
  types: ConvType[];
  groups: ConvGroupInfo[];
}

type Result =
  | { kind: "text"; text: string; name: string }
  | { kind: "file"; url: string; name: string };

type MediaKind = "image" | "video" | "audio" | "pdf" | "other";

const TEXT_FILE_ACCEPT =
  ".txt,.text,.md,.markdown,.csv,.json,.log,.srt,.vtt,.xml,.html,.htm,text/*";

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "avif"];
const VIDEO_EXT = ["mp4", "webm", "mov", "mkv", "avi", "flv", "wmv", "m4v"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "aac", "flac", "m4a", "opus"];

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function kindOfName(name: string): MediaKind {
  const ext = extOf(name);
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return "other";
}

function kindOfFile(file: File | undefined): MediaKind {
  if (!file) return "other";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return kindOfName(file.name);
}

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

/** The long free-text box some converters take instead of a file. */
function textOptionOf(type: ConvType) {
  return type.options.find((o) => o.type === "textarea") ?? null;
}

/** The optional “paste a video link instead of uploading” field. */
function urlOptionOf(type: ConvType) {
  return type.options.find((o) => o.id === "url") ?? null;
}

/** A checkerboard so transparent PNGs read clearly in the preview. */
const CHECKER_STYLE = {
  backgroundImage:
    "repeating-conic-gradient(var(--border) 0% 25%, var(--surface) 0% 50%)",
  backgroundSize: "18px 18px",
} as const;

function MediaPane({
  label,
  url,
  kind,
  checker,
}: {
  label: string;
  url: string;
  kind: MediaKind;
  checker?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-2 p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-fg-subtle">{label}</p>
      {kind === "image" && (
        <div
          className="flex items-center justify-center overflow-hidden rounded-md"
          style={checker ? CHECKER_STYLE : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="max-h-72 w-full object-contain" />
        </div>
      )}
      {kind === "video" && <video src={url} controls className="w-full rounded-md" />}
      {kind === "audio" && <audio src={url} controls className="w-full" />}
    </div>
  );
}

export default function ConverterClient({ types, groups }: Props) {
  const firstGroup = useMemo<ConvGroup>(() => {
    for (const g of groups) if (types.some((t) => t.group === g.id)) return g.id;
    return groups[0]?.id ?? "image";
  }, [types, groups]);

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
  const [textDragging, setTextDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [textFileName, setTextFileName] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);

  const active = types.find((t) => t.slug === slug) ?? null;
  const groupTypes = types.filter((t) => t.group === group);
  const textOption = active ? textOptionOf(active) : null;
  const urlOption = active ? urlOptionOf(active) : null;
  const isTextGroup = active?.group === "text";
  const wantsTextPreview =
    isTextGroup ||
    active?.slug === "video-to-text" ||
    active?.slug === "video-to-skill" ||
    active?.slug === "audio-to-text";
  const videoUrl = urlOption ? String(opts.url ?? "").trim() : "";
  const boxHeight = (textOption?.rows ?? 8) * 20 + 18;

  const previewText = result?.kind === "text" ? result.text : "";
  const hasPreviewText = previewText.length > 0;

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
    setTextFileName("");
  }, [active]);

  /* A local object URL previews the chosen file before it is converted. */
  useEffect(() => {
    const f = files[0];
    if (!f) {
      setOriginalUrl("");
      return;
    }
    const kind = kindOfFile(f);
    if (kind !== "image" && kind !== "video" && kind !== "audio") {
      setOriginalUrl("");
      return;
    }
    const url = URL.createObjectURL(f);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  /* Free the blob URL created for a text → audio result. */
  useEffect(() => {
    if (result?.kind !== "file" || !result.url.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

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

  /** Load a text file straight into the converter's textarea. */
  const loadTextFile = async (file: File | undefined) => {
    if (!file || !textOption) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("That text file is too large — 2 MB is the limit.");
      return;
    }
    try {
      const text = await file.text();
      setOption(textOption.id, text);
      setTextFileName(file.name);
      setResult(null);
      setError("");
    } catch {
      setError("That file could not be read as text.");
    }
  };

  const poll = async (
    engineUrl: string,
    jobId: string,
    ticket: string,
    fallbackName: string,
    fromUrl: boolean,
  ) => {
    const deadline = Date.now() + 15 * 60 * 1000;
    for (;;) {
      if (!alive.current) return null;
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
      if (!alive.current) return null;
      setProgress(Math.max(5, Math.min(99, Math.round(job.percent ?? 0))));
      if (job.status === "error") throw new Error(job.error || "Conversion failed.");
      if (job.status === "done") {
        setProgress(100);
        return {
          url: `${engineUrl}/api/file/${jobId}?t=${encodeURIComponent(ticket)}`,
          name: job.filename || fallbackName,
        };
      }
      setStatus(
        job.status === "downloading"
          ? fromUrl
            ? "Fetching the video…"
            : "Uploading your file…"
          : "Converting…",
      );
    }
  };

  const convert = async () => {
    if (!active || busy) return;
    if (active.needsFile && !files.length && !videoUrl) {
      setError(
        urlOption
          ? "Choose a file or paste a video link first."
          : active.multiple
            ? "Choose at least one file first."
            : "Choose a file first.",
      );
      return;
    }
    if (textOption) {
      const value = String(opts[textOption.id] ?? "").trim();
      if (!value) {
        setError(`Enter some text in “${textOption.label}” first.`);
        return;
      }
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
      if (data.jobId) {
        charge = {
          jobId: String(data.jobId),
          // Video → Text/Skill run on the engine but can still fail in the
          // site-side transcription step, so refunds are site-side.
          mode: data.siteKind === "transcribe-job" ? "site" : String(data.mode ?? "engine"),
        };
      }

      const base = (files[0]?.name ?? (videoUrl ? "video" : "converted")).replace(/\.[^.]+$/, "");

      /* ── site-side: text utilities ─────────────────────────────────── */
      if (data.mode === "site" && data.siteKind === "text") {
        const fd = new FormData();
        fd.append("slug", active.slug);
        fd.append("options", JSON.stringify(opts));
        for (const f of files) fd.append("files", f);
        setStatus("Working…");
        setProgress(45);
        const r = await fetch("/api/converter/run", { method: "POST", body: fd });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out.error || "Conversion failed.");
        setProgress(100);
        setResult({ kind: "text", text: out.text ?? "", name: `${base === "converted" ? active.slug : base}.txt` });
        return;
      }

      /* ── site-side: text → speech ──────────────────────────────────── */
      if (data.mode === "site" && data.siteKind === "tts") {
        setStatus("Generating speech…");
        setProgress(45);
        const voice = String(opts.voice ?? "en-US-GuyNeural");
        const r = await fetch("/api/converter/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: String(opts.text ?? ""),
            voice,
            rate: String(opts.rate ?? "0%"),
            volume: String(opts.volume ?? "0%"),
          }),
        });
        if (!r.ok) {
          const out = await r.json().catch(() => ({}));
          throw new Error(out.error || "Speech generation failed.");
        }
        const blob = await r.blob();
        setProgress(100);
        setResult({ kind: "file", url: URL.createObjectURL(blob), name: `speech-${voice}.mp3` });
        return;
      }

      /* ── site-side: transcribe a small file ────────────────────────── */
      if (data.mode === "site" && data.siteKind === "transcribe") {
        const fd = new FormData();
        fd.append("file", files[0]);
        fd.append("slug", active.slug);
        fd.append("language", String(opts.language ?? "auto"));
        fd.append("skillName", String(opts.skillName ?? ""));
        fd.append("targetLLM", String(opts.targetLLM ?? "universal"));
        setStatus("Transcribing…");
        setProgress(40);
        const r = await fetch("/api/converter/transcribe", { method: "POST", body: fd });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out.error || "Transcription failed.");
        setProgress(100);
        setResult({ kind: "text", text: out.text, name: `${base}.txt` });
        return;
      }

      /* ── engine: upload the file straight to Render ────────────────── */
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      setStatus(files.length ? "Uploading your file…" : "Sending the link to the engine…");
      setProgress(8);
      const up = await fetch(`${data.uploadUrl}?p=${encodeURIComponent(data.ticket)}`, {
        method: "POST",
        body: fd,
      });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(upJson.error || `Upload failed (${up.status}).`);

      const jobId = String(upJson.jobId || data.jobId);

      /* Video → Text / Skill: the engine hands back the audio track, then
         the site transcribes it (video files are too big for Gemini inline). */
      if (data.siteKind === "transcribe-job") {
        await poll(data.engineUrl, jobId, data.progressTicket, "audio", !files.length);
        setStatus("Transcribing…");
        setProgress(85);
        const r = await fetch("/api/converter/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            ticket: data.progressTicket,
            slug: active.slug,
            language: String(opts.language ?? "auto"),
            skillName: String(opts.skillName ?? ""),
            targetLLM: String(opts.targetLLM ?? "universal"),
          }),
        });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out.error || "Transcription failed.");
        setProgress(100);
        setResult({ kind: "text", text: out.text, name: `${base}.txt` });
        return;
      }

      const done = await poll(
        data.engineUrl,
        jobId,
        data.progressTicket,
        `${base}-converted`,
        !files.length,
      );
      if (done) setResult({ kind: "file", url: done.url, name: done.name });
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
    if (!hasPreviewText) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(previewText);
      ok = true;
    } catch {
      /* The async clipboard API can be blocked (permissions, http). Fall
         back to selecting the read-only preview and copying it the old way. */
      const el = previewRef.current;
      if (el) {
        el.select();
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        el.setSelectionRange(0, 0);
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const downloadTextAs = (format: "txt" | "docx") => {
    if (!hasPreviewText) return;
    const baseName = (result?.kind === "text" ? result.name : "result").replace(/\.[^.]+$/, "") || "result";
    if (format === "docx") {
      saveBlob(buildDocxBlob(previewText), `${baseName}.docx`);
    } else {
      saveText(previewText, `${baseName}.txt`);
    }
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

  const optionFields = active
    ? active.options.filter((o) => o.type !== "textarea" && o.id !== "url")
    : [];

  const optionsGrid = optionFields.length ? (
    <div className="grid gap-3 sm:grid-cols-2">
      {optionFields.map((o) => (
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
              placeholder={o.placeholder}
              onChange={(e) => setOption(o.id, o.type === "number" ? Number(e.target.value) : e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
            />
          )}
        </div>
      ))}
    </div>
  ) : null;

  const fileDrop = active?.needsFile ? (
    <>
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
          {urlOption ? " — or paste a link above" : ""}
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
    </>
  ) : null;

  const textPreview = wantsTextPreview ? (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium text-fg">Preview</label>
        <span className="text-xs text-fg-subtle">
          {hasPreviewText ? "Result ready — copy or download it" : "The result appears here"}
        </span>
      </div>
      <textarea
        ref={previewRef}
        readOnly
        value={previewText}
        rows={textOption?.rows ?? 8}
        style={{ minHeight: boxHeight }}
        placeholder="Your result will appear here after you convert."
        className="mt-1.5 w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={copyText} disabled={!hasPreviewText}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy text"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => downloadTextAs("txt")} disabled={!hasPreviewText}>
          <Download className="h-4 w-4" /> .txt
        </Button>
        <Button variant="secondary" size="sm" onClick={() => downloadTextAs("docx")} disabled={!hasPreviewText}>
          <Download className="h-4 w-4" /> .docx
        </Button>
      </div>
    </div>
  ) : null;

  const origKind = kindOfFile(files[0]);
  const resKind = result?.kind === "file" ? kindOfName(result.name) : "other";
  const showOrig = !!originalUrl && origKind !== "other" && origKind !== "pdf";
  const showRes = result?.kind === "file" && resKind !== "other" && resKind !== "pdf";
  const mediaPreview =
    showOrig || showRes ? (
      <div className={`grid gap-3 ${showOrig && showRes ? "sm:grid-cols-2" : ""}`}>
        {showOrig && <MediaPane label="Original" url={originalUrl} kind={origKind} />}
        {showRes && result?.kind === "file" && (
          <MediaPane label="Result" url={result.url} kind={resKind} checker />
        )}
      </div>
    ) : null;

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
            {groups.map((g) => {
              const count = types.filter((t) => t.group === g.id).length;
              if (!count) return null;
              const on = g.id === group;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => pickGroup(g.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    on ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary"
                  }`}
                >
                  <span className={`block text-sm font-bold ${on ? "text-primary" : "text-fg"}`}>{g.label}</span>
                  <span className="block text-[11px] text-fg-subtle">{g.blurb}</span>
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
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-fg">
                {active.group === "text" && <FileText className="h-4 w-4 text-primary" />}
                {active.group === "video" && <Video className="h-4 w-4 text-primary" />}
                {active.group === "audio" && <Music className="h-4 w-4 text-primary" />}
                {active.group === "image" && <ImageIcon className="h-4 w-4 text-primary" />}
                {active.group === "ai" && <ImageIcon className="h-4 w-4 text-primary" />}
                {active.group === "document" && <FileText className="h-4 w-4 text-primary" />}
                {active.label}
              </p>
              {active.description && <p className="mt-0.5 text-xs text-fg-muted">{active.description}</p>}
            </div>

            {/* options first for text tools, so the preview sits right under the input */}
            {isTextGroup && optionsGrid}

            {/* text input + file loader + preview */}
            {textOption && (
              <>
                <div>
                  <label className="text-sm font-medium text-fg">{textOption.label}</label>
                  <textarea
                    value={String(opts[textOption.id] ?? "")}
                    onChange={(e) => setOption(textOption.id, e.target.value)}
                    rows={textOption.rows ?? 8}
                    style={{ minHeight: boxHeight }}
                    placeholder={textOption.placeholder ?? ""}
                    className="mt-1.5 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
                  />
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setTextDragging(true);
                  }}
                  onDragLeave={() => setTextDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setTextDragging(false);
                    void loadTextFile(e.dataTransfer.files[0]);
                  }}
                  onClick={() => textInputRef.current?.click()}
                  style={{ minHeight: boxHeight }}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                    textDragging ? "border-primary bg-primary-soft" : "border-border bg-surface-2 hover:border-primary"
                  }`}
                >
                  <Upload className="h-6 w-6 text-primary" />
                  <p className="mt-2 text-sm font-semibold text-fg">
                    Drop a text file here, or click to load it
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">.txt · .md · .csv · .json · .srt — up to 2 MB</p>
                  {textFileName && (
                    <p className="mt-2 max-w-full truncate text-xs font-semibold text-primary">
                      Loaded {textFileName}
                    </p>
                  )}
                  <input
                    ref={textInputRef}
                    type="file"
                    accept={TEXT_FILE_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      void loadTextFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>

                {textPreview}
              </>
            )}

            {/* video link */}
            {urlOption && (
              <div>
                <label className="text-sm font-medium text-fg">Video link (optional)</label>
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 focus-within:border-primary">
                  <Link2 className="h-4 w-4 shrink-0 text-fg-subtle" />
                  <input
                    type="url"
                    value={String(opts.url ?? "")}
                    onChange={(e) => setOption("url", e.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                    className="w-full bg-transparent py-2 text-sm text-fg outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-fg-subtle">
                  Paste a YouTube, TikTok, Instagram or Facebook link — or drop a file below.
                </p>
              </div>
            )}

            {/* file input */}
            {fileDrop}

            {/* options for non-text tools */}
            {!isTextGroup && optionsGrid}

            {/* text result for video → text / skill */}
            {!textOption && textPreview}

            {/* before / after media preview */}
            {mediaPreview}

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
                {active.needsFile
                  ? "Files are processed on our engine and deleted after download."
                  : "Nothing is stored — the result is shown here only."}
              </span>
            </div>

            {result?.kind === "file" && (
              <div className="rounded-lg border border-border bg-surface-2 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <Check className="h-4 w-4 text-success" /> Your file is ready
                </p>
                <a
                  href={result.url}
                  download={result.name}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                >
                  <Download className="h-4 w-4" /> Download {result.name}
                </a>
                <p className="mt-2 text-xs text-fg-subtle">
                  Download it now — the engine keeps it for a short while and then deletes it.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
