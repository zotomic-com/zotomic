"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Download, Loader2, Search } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuotaPanel, type QuotaInfo } from "@/components/site/service-tools";

interface Voice {
  id: string;
  gender: string;
  locale: string;
}

const MAX_CHARS = 5000;

const STYLES = [
  { id: "ocean", label: "Ocean", hint: "navy → green" },
  { id: "sunset", label: "Sunset", hint: "purple → orange" },
  { id: "night", label: "Night", hint: "charcoal" },
];

/** Stick-figure cast — ids/colors mirror the engine's stickman.js. */
const CHARACTERS = [
  { id: "spike", name: "Spike", color: "#1f2937", accessory: "none" },
  { id: "ruby", name: "Ruby", color: "#e11d48", accessory: "bow" },
  { id: "max", name: "Max", color: "#2563eb", accessory: "cap" },
  { id: "luna", name: "Luna", color: "#7c3aed", accessory: "ponytail" },
  { id: "ace", name: "Ace", color: "#059669", accessory: "headphones" },
  { id: "bella", name: "Bella", color: "#db2777", accessory: "glasses" },
  { id: "rocky", name: "Rocky", color: "#ea580c", accessory: "beanie" },
  { id: "zara", name: "Zara", color: "#0d9488", accessory: "bun" },
] as const;

/** Tiny inline SVG preview of each character (matching the accessory). */
function FigureIcon({ color, accessory, className }: { color: string; accessory: string; className?: string }) {
  return (
    <svg viewBox="0 0 32 44" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" className={className}>
      {/* accessory */}
      {accessory === "cap" && <path d="M10 10 h12" strokeWidth={3} />}
      {accessory === "bow" && <path d="M22 7 l4 -3 M22 7 l4 3" strokeWidth={2} />}
      {accessory === "ponytail" && <path d="M23 8 q5 3 4 9" />}
      {accessory === "headphones" && <path d="M9 9 q7 -7 14 0" />}
      {accessory === "glasses" && <circle cx="18.5" cy="10" r={2.6} strokeWidth={1.6} />}
      {accessory === "beanie" && <path d="M9 9 q7 -6 14 0 l0 3" strokeWidth={2.8} />}
      {accessory === "bun" && <circle cx="22" cy="6" r={2.4} />}
      {/* head */}
      <circle cx="16" cy="10" r={6} fill="none" />
      {/* body + arms + legs */}
      <path d="M16 16 v11" />
      <path d="M16 19 l-6 6 M16 19 l6 4" />
      <path d="M16 27 l-5 12 M16 27 l5 12" />
    </svg>
  );
}

const QUICK_VOICES = [
  "en-US-GuyNeural",
  "en-US-AriaNeural",
  "en-US-AndrewNeural",
  "en-GB-SoniaNeural",
  "en-IN-NeerjaNeural",
];

export default function VideoGeneratorClient() {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [query, setQuery] = useState("");
  const [voice, setVoice] = useState("en-US-GuyNeural");
  const [style, setStyle] = useState("ocean");
  const [character, setCharacter] = useState<string>("spike");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/services/tools/tts")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: Voice[]) => {
        if (Array.isArray(list) && list.length) setVoices(list);
      })
      .catch(() => setVoices([]));
    fetch("/api/services/tools/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.video && !d.video.error && setQuota(d.video))
      .catch(() => {});
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!voices) return [];
    const q = query.toLowerCase();
    return voices
      .filter((v) => !q || v.id.toLowerCase().includes(q) || v.locale.toLowerCase().includes(q))
      .slice(0, 400);
  }, [voices, query]);

  const poll = (progressUrl: string, fileUrl: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      let r: Response;
      let p: { status?: string; percent?: number; note?: string; error?: string };
      try {
        r = await fetch(progressUrl);
        p = await r.json();
      } catch {
        return; // transient network hiccup — keep polling
      }
      if (r.status === 404 && p.error) {
        window.clearInterval(pollRef.current!);
        setError(p.error);
        setBusy(false);
        return;
      }
      if (typeof p.percent === "number") setPercent(Math.round(p.percent));
      if (p.note) setPhase(p.note);
      if (p.status === "done") {
        window.clearInterval(pollRef.current!);
        setPhase("Done!");
        setPercent(100);
        setVideoUrl(fileUrl);
        setBusy(false);
      } else if (p.status === "error") {
        window.clearInterval(pollRef.current!);
        setError(p.error || "Video generation failed. Please try again.");
        setBusy(false);
      }
    }, 3000);
  };

  const generate = async () => {
    const t = text.trim();
    setError("");
    setVideoUrl("");
    if (t.length < 10) {
      setError("Please write at least a sentence (10+ characters).");
      return;
    }
    setBusy(true);
    setPhase("Sending your script…");
    setPercent(0);
    try {
      const res = await fetch("/api/services/tools/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, voice, style, character }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.progressUrl) {
        throw new Error(data.error || `Server error (${res.status})`);
      }
      setPhase("Generating the voice…");
      poll(data.progressUrl, data.fileUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const download = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = "zotomic-video.mp4";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-bold text-fg">
          <Clapperboard className="h-4 w-4 text-primary" /> Script to video
        </p>

        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            placeholder={
              character
                ? "Paste a script or a timestamped storyboard (e.g. `0:00 - 0:08 | The Setup` + Visual/Audio/Voiceover lines) — the character acts out each scene. Plain scripts are narrated scene by scene."
                : "Paste your script here — every sentence becomes a narrated scene with word-synced captions."
            }
            rows={7}
            className="w-full rounded-lg border border-border bg-surface p-3 text-sm text-fg outline-none focus:border-primary"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-fg-muted">
            <span>~{Math.max(1, Math.round(text.length / 20))}s of video</span>
            <span>{text.length}/{MAX_CHARS}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-fg">Voice</p>
            <select
              value={QUICK_VOICES.includes(voice) ? voice : "custom"}
              onChange={(e) => e.target.value !== "custom" && setVoice(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
            >
              {QUICK_VOICES.map((v) => (
                <option key={v} value={v}>{v.replace(/Neural$/, "").replace(/-/g, " ")}</option>
              ))}
              {!QUICK_VOICES.includes(voice) && <option value="custom">{voice}</option>}
            </select>
            <div className="mt-2 flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-fg-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search 300+ voices…"
                  className="w-full rounded-lg border border-border bg-surface py-2 pl-7 pr-2 text-xs text-fg outline-none focus:border-primary"
                />
              </div>
            </div>
            {query && (
              <select
                size={4}
                onChange={(e) => { setVoice(e.target.value); setQuery(""); }}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs text-fg"
              >
                {filtered.map((v) => (
                  <option key={v.id} value={v.id}>{v.id}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-fg">Style</p>
            <div className="grid gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                    style === s.id ? "border-primary bg-primary-soft text-fg" : "border-border bg-surface text-fg-muted hover:border-primary"
                  }`}
                >
                  <span className="font-semibold">{s.label}</span>
                  <span className="text-xs">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold text-fg">Character</p>
            <span className="text-xs text-fg-muted">{character ? "acts out your script" : "plain background"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <button
              key="none"
              type="button"
              onClick={() => setCharacter("")}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 transition-colors ${
                character === "" ? "border-primary bg-primary-soft text-fg" : "border-border bg-surface text-fg-muted hover:border-primary"
              }`}
            >
              <svg viewBox="0 0 32 44" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" opacity={0.35}>
                <rect x="5" y="5" width="22" height="34" rx="4" />
              </svg>
              <span className="text-[11px] font-semibold">None</span>
            </button>
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCharacter(c.id)}
                className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 transition-colors ${
                  character === c.id ? "border-primary bg-primary-soft text-fg" : "border-border bg-surface text-fg-muted hover:border-primary"
                }`}
              >
                <FigureIcon color={c.color} accessory={c.accessory} className="h-9 w-9" />
                <span className="text-[11px] font-semibold">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        <QuotaPanel quota={quota} unit="videos" />

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generate} disabled={busy || text.trim().length < 10}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
            {busy ? "Generating…" : "Generate video"}
          </Button>
          {videoUrl && (
            <Button variant="secondary" onClick={download}>
              <Download className="h-4 w-4" /> Download MP4
            </Button>
          )}
          <Badge tone="neutral">540 × 960 · MP4</Badge>
        </div>

        {busy && (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-fg-muted">{phase} {percent > 0 && `${percent}%`}</p>
          </div>
        )}

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        {videoUrl && (
          <video src={videoUrl} controls playsInline className="w-full max-w-xs rounded-lg border border-border" />
        )}
      </CardBody>
    </Card>
  );
}
