"use client";

import { useEffect, useState } from "react";
import { Download, Link2, Loader2, Music, Video } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuotaPanel, type QuotaInfo } from "@/components/site/service-tools";

interface VideoInfo {
  platform: string;
  title: string;
  uploader: string;
  duration: string | null;
  thumbnail: string;
  isLive: boolean;
  qualities: Array<{ id: string; label: string }>;
}

interface StartResult {
  jobId: string;
  progressUrl: string;
  fileUrl: string;
}

interface Progress {
  status: "starting" | "downloading" | "done" | "error";
  percent: number;
  speed: string;
  eta: string;
  title: string;
  hasFile: boolean;
  error: string;
}

export default function OnlineDownloaderClient() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [infoBusy, setInfoBusy] = useState(false);
  const [infoError, setInfoError] = useState("");
  const [mode, setMode] = useState<"video" | "audio">("video");
  const [qualityId, setQualityId] = useState("best");
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [job, setJob] = useState<StartResult | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    fetch("/api/services/tools/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.downloader && !d.downloader.error && setQuota(d.downloader))
      .catch(() => {});
  }, []);

  const reset = () => {
    setInfo(null);
    setInfoError("");
    setJob(null);
    setProgress(null);
    setStartError("");
  };

  const resolve = async () => {
    const u = url.trim();
    setInfoError("");
    setInfo(null);
    if (!u) {
      setInfoError("Please paste a video link first.");
      return;
    }
    setInfoBusy(true);
    try {
      const res = await fetch("/api/services/tools/downloader/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      setInfo(data);
      setQualityId("best");
      setMode("video");
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : "Could not resolve this link.");
    } finally {
      setInfoBusy(false);
    }
  };

  const start = async (m: "video" | "audio") => {
    if (!info) return;
    setStartError("");
    setProgress(null);
    setMode(m);
    try {
      const res = await fetch("/api/services/tools/downloader/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode: m, qualityId: m === "video" ? qualityId : "best" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      setJob(data);
      poll(data.progressUrl);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Could not start the download.");
    }
  };

  const poll = (progressUrl: string) => {
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        clearInterval(timer);
        setStartError("This job took too long. Please try again.");
        return;
      }
      try {
        const res = await fetch(progressUrl);
        if (!res.ok) throw new Error("lost");
        const p: Progress = await res.json();
        setProgress(p);
        if (p.status === "done" || p.status === "error") {
          clearInterval(timer);
          if (p.status === "error") setStartError(p.error || "The download failed.");
          fetch("/api/services/tools/me")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d?.downloader && !d.downloader.error && setQuota(d.downloader))
            .catch(() => {});
        }
      } catch {
        // transient network error — keep polling until the ticket expires
      }
    }, 1500);
  };

  const busy = infoBusy || (!!job && progress?.status !== "done" && progress?.status !== "error");

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-fg">
            <Link2 className="h-4 w-4 text-primary" /> Video downloader
          </p>
          <QuotaPanel quota={quota} unit="downloads" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && resolve()}
            placeholder="Paste a YouTube, TikTok, Instagram or Facebook link…"
            disabled={busy}
            className="flex-1"
          />
          <Button onClick={resolve} disabled={busy || infoBusy} size="md" className="shrink-0">
            {infoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Fetch
          </Button>
        </div>

        {infoError && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{infoError}</p>}

        {info && (
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              {info.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={info.thumbnail}
                  alt={info.title}
                  className="h-28 w-full rounded-lg border border-border object-cover sm:w-48"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{info.platform}</p>
                <p className="mt-0.5 truncate font-bold text-fg" title={info.title}>
                  {info.title}
                </p>
                <p className="mt-0.5 text-sm text-fg-muted">
                  {[info.uploader, info.duration].filter(Boolean).join(" · ")}
                </p>

                {mode === "video" && (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-fg-muted">Quality</label>
                    <select
                      value={qualityId}
                      onChange={(e) => setQualityId(e.target.value)}
                      disabled={busy}
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary sm:w-56"
                    >
                      {info.qualities.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => start("video")} disabled={busy} size="sm">
                <Video className="h-4 w-4" /> Download video
              </Button>
              <Button onClick={() => start("audio")} disabled={busy} size="sm" variant="secondary">
                <Music className="h-4 w-4" /> Extract MP3
              </Button>
              <Button onClick={reset} size="sm" variant="ghost">
                Different link
              </Button>
            </div>
          </div>
        )}

        {startError && !progress && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{startError}</p>
        )}

        {job && progress && progress.status !== "error" && (
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            {progress.status === "done" ? (
              <div className="space-y-2">
                <p className="text-sm font-bold text-success">Download ready</p>
                <a
                  href={job.fileUrl}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                >
                  <Download className="h-4 w-4" /> Save to device
                </a>
                <p className="text-xs text-fg-subtle">
                  The file is removed from the server right after you save it.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium text-fg">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    {mode === "audio" ? "Extracting MP3…" : "Downloading…"}
                  </span>
                  <span className="font-mono text-xs text-fg-muted">
                    {progress.speed} {progress.eta && `· ETA ${progress.eta}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round(progress.percent)}%` }}
                  />
                </div>
                <p className="text-right text-xs font-semibold text-fg-muted">{Math.round(progress.percent)}%</p>
              </div>
            )}
          </div>
        )}

        {progress?.status === "error" && startError && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{startError}</p>
        )}
      </CardBody>
    </Card>
  );
}
