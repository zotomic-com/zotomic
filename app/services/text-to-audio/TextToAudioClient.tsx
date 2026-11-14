"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Download, Loader2, Search } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuotaPanel, type QuotaInfo } from "@/components/site/service-tools";

interface Voice {
  id: string;
  gender: string;
  locale: string;
}

const MAX_CHARS = 3000;

export default function TextToAudioClient() {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [query, setQuery] = useState("");
  const [voice, setVoice] = useState("en-US-GuyNeural");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const lastObjectUrl = useRef("");

  useEffect(() => {
    fetch("/api/services/tools/tts")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: Voice[]) => {
        if (Array.isArray(list) && list.length) {
          setVoices(list);
          if (!list.some((v) => v.id === voice)) setVoice(list[0].id);
        }
      })
      .catch(() => setVoices([{ id: "en-US-GuyNeural", gender: "male", locale: "en-US" }]));
    fetch("/api/services/tools/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.tts && !d.tts.error && setQuota(d.tts))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!voices) return [];
    const q = query.toLowerCase();
    const list = voices.filter((v) => !q || v.id.toLowerCase().includes(q) || v.locale.toLowerCase().includes(q));
    return list.slice(0, 400);
  }, [voices, query]);

  const generate = async () => {
    const t = text.trim();
    setError("");
    setAudioUrl("");
    if (!t) {
      setError("Please enter some text first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/services/tools/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, voice }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const blob = await res.blob();
      if (lastObjectUrl.current) URL.revokeObjectURL(lastObjectUrl.current);
      const url = URL.createObjectURL(blob);
      lastObjectUrl.current = url;
      setAudioUrl(url);
      fetch("/api/services/tools/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.tts && !d.tts.error && setQuota(d.tts))
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-fg">
            <AudioLines className="h-4 w-4 text-primary" /> Text to speech
          </p>
          <QuotaPanel quota={quota} unit="generations" />
        </div>

        <div>
          <label className="text-sm font-medium text-fg">Voice</label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search language or voice…"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-fg outline-none focus:border-primary"
              />
            </div>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
            >
              {voices === null && <option value={voice}>{voice}</option>}
              {filtered.length === 0 && <option disabled>No voices match your search</option>}
              {filtered.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.locale} · {v.id.replace(/--.*$/, "")} ({v.gender})
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-xs text-fg-subtle">
            {voices ? `${voices.length}+ neural voices available` : "Loading voices…"}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-fg">Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            rows={6}
            placeholder="Type or paste the text you want to hear…"
            className="mt-1.5 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
          />
          <p className="mt-1 text-right text-xs text-fg-subtle">
            {text.length} / {MAX_CHARS}
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={generate} disabled={busy} size="md">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <AudioLines className="h-4 w-4" /> Generate audio
              </>
            )}
          </Button>
        </div>

        {audioUrl && (
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <audio controls src={audioUrl} className="w-full" autoPlay />
            <a
              href={audioUrl}
              download={`speech-${voice}.mp3`}
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <Download className="h-4 w-4" /> Download MP3
            </a>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
