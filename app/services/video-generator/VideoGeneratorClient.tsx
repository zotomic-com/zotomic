"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Check, ClipboardList, Copy, Download, Loader2, Search, Sparkles } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuotaPanel, type QuotaInfo } from "@/components/site/service-tools";
import { CHARACTERS, type CastMember } from "@/lib/videos/characters";

interface Voice {
  id: string;
  gender: string;
  locale: string;
}

const MAX_CHARS = 5000;

const STYLES = [
  { id: "auto", label: "Auto", hint: "adapts colors per scene" },
  { id: "ocean", label: "Ocean", hint: "navy → green" },
  { id: "sunset", label: "Sunset", hint: "purple → orange" },
  { id: "night", label: "Night", hint: "charcoal" },
  { id: "blank", label: "Blank", hint: "plain white screen" },
];

const AUDIO_STYLES = [
  { id: "auto", label: "Auto (matches story)" },
  { id: "story", label: "Storyteller" },
  { id: "podcast", label: "Podcast" },
  { id: "dialogue", label: "Dialogue" },
  { id: "narrator", label: "Movie Narrator" },
  { id: "news", label: "Newsreader" },
  { id: "hype", label: "Hype / Excited" },
];

/** Copy-paste prompt that makes Gemini / ChatGPT / Claude write a story in
 * the exact storyboard format this tool renders (≤50s, ≤120 spoken words,
 * per-scene Colors line for the Auto style). */
const MASTER_PROMPT = `You are a storyboard writer for Zotomic's AI video generator. Write a short vertical video story (maximum 50 seconds) that I will paste into Zotomic to render as an animated stick-figure video with voiceover.

TOPIC: <write your topic here>

STORY STYLE: <pick one and edit it before sending: funny comedy, storyteller, movie narration, business, motivational, horror, sci-fi, kids story>

STRICT FORMAT RULES — follow exactly:
1. Write 5 to 7 scenes. Total story time must NOT exceed 50 seconds (for example: 0:00 - 0:08, 0:08 - 0:16 ... ending at 0:50).
2. Start every scene with this exact header line:
0:00 - 0:08 | Scene Title
3. Under each header add exactly these four lines:
Visual: ONE simple action the main character does (walk, run, jump, wave, point, fall, celebrate, think, write at a desk, cook, dance, sit, sleep, cry, laugh, eat, drink, open a gift box, knock on a door, throw, catch, carry, push, climb, swim, bow, stretch). No camera directions, no close-ups, no zooms, no scene changes. Mentioning an object shows it in the scene: gift box, door, window, table, chair, car, ball, TV, couch, bed, desk, tree (for example "opens the gift box", "sits on the couch", "knocks on the door").
Audio: sound effects or music mood (one short line).
Colors: the scene's background and element color mood (one short line), for example "sunny yellow morning with warm orange light", "purple night with glowing cyan elements", "cool blue tech lab with chrome details". Each scene can have a different color mood that fits the story.
Voiceover: the narration for that scene inside quotes, maximum 25 words, simple English words.
4. The story has ONE main stick-figure character who appears in EVERY scene. Give the character a short name and use it in the Visual lines.
5. Total Voiceover words across all scenes: maximum 120 words.
6. Output ONLY the finished story in the format above — no explanations, no markdown, no code block.

Example of the exact format:
0:00 - 0:08 | The Dream
Visual: Max wakes up, stretches and celebrates with both arms in the air.
Audio: Soft morning music.
Colors: sunny yellow morning with warm orange light.
Voiceover: "Every morning, Max dreams of building something big."

Now write the story on my TOPIC in my STORY STYLE.`;

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
      {accessory === "messy" && <path d="M12 5 l-2 -3 M16 4 v-3 M20 5 l2 -3" strokeWidth={1.8} />}
      {accessory === "curly" && <path d="M10 8 q1.5 -2.5 3 0 q1.5 -2.5 3 0 q1.5 -2.5 3 0 q1.5 -2.5 3 0" strokeWidth={1.8} />}
      {accessory === "bangs" && <path d="M10 8 h12 v2 h-12 z" strokeWidth={1.6} fill={color} />}
      {accessory === "flat" && <path d="M11 7 h10 v-3 h-10 z" strokeWidth={1.8} />}
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
  const [style, setStyle] = useState("auto");
  const [character, setCharacter] = useState<string>("spike");
  const [audioStyle, setAudioStyle] = useState("auto");
  const [promptCopied, setPromptCopied] = useState(false);
  const [idea, setIdea] = useState("");
  const [writing, setWriting] = useState(false);
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
        body: JSON.stringify({ text: t, voice, style, character, audioStyle }),
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

  /** Zotomic AI turns the rough idea into a render-ready storyboard. */
  const writeWithAI = async () => {
    const i = idea.trim();
    setError("");
    if (i.length < 10) {
      setError("Describe your idea in at least a sentence (10+ characters).");
      return;
    }
    setWriting(true);
    try {
      const res = await fetch("/api/services/tools/video/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: i, character }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.storyboard) throw new Error(data.error || `Server error (${res.status})`);
      setText(String(data.storyboard).slice(0, MAX_CHARS));
      setIdea("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setWriting(false);
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(MASTER_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      // clipboard blocked (non-HTTPS / permissions) — user can still select the text
    }
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
            <span>~{Math.min(60, Math.max(1, Math.round(text.length / 20)))}s of video</span>
            <span>{text.length}/{MAX_CHARS}</span>
          </div>
        </div>

        {/* AI storyboard writer — paste any idea, Zotomic AI writes the storyboard */}
        <details className="rounded-lg border border-primary/40 bg-primary-soft/40">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-fg">
            <Sparkles className="h-4 w-4 text-primary" /> Let Zotomic AI write the storyboard for you
            <span className="ml-auto text-xs font-normal text-fg-muted">paste any idea — no format needed</span>
          </summary>
          <div className="space-y-2 border-t border-primary/30 px-3 py-3">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value.slice(0, 2000))}
              rows={3}
              placeholder={`e.g. "a funny story about Max opening a mystery gift box that turns out to be full of socks" — or paste a rough script, bullet points, anything.`}
              className="w-full rounded-lg border border-border bg-surface p-3 text-sm text-fg outline-none focus:border-primary"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={writeWithAI} disabled={writing || idea.trim().length < 10}>
                {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {writing ? "Writing your storyboard…" : `Write storyboard (${CHARACTERS.find((c) => c.id === character)?.name ?? "character"} acts it out)`}
              </Button>
              <span className="text-xs text-fg-muted">
                {writing ? "Usually 10–20 seconds" : "The storyboard lands in the script box above — edit it freely, then Generate video."}
              </span>
            </div>
            <p className="text-xs text-fg-muted">
              Counts as part of a video: 1 video = 1 AI-written storyboard + 1 render against your daily plan.
            </p>
          </div>
        </details>

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
            <div className="mt-2">
              <p className="mb-1 text-xs font-semibold text-fg">Audio style</p>
              <select
                value={audioStyle}
                onChange={(e) => setAudioStyle(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
              >
                {AUDIO_STYLES.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
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
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
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

        <details className="rounded-lg border border-border bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-fg">
            <ClipboardList className="h-4 w-4 text-primary" /> AI Story Master Prompt
            <span className="ml-auto text-xs font-normal text-fg-muted">for Gemini / ChatGPT / Claude</span>
          </summary>
          <div className="space-y-2 border-t border-border px-3 py-3">
            <ol className="list-inside list-decimal space-y-0.5 text-xs text-fg-muted">
              <li>
                <b className="text-fg">Easier:</b> use the “Let Zotomic AI write the storyboard” panel above — no copy-pasting needed.
              </li>
              <li>
                Manual way: copy this prompt, <b className="text-fg">edit the STORY STYLE line</b>, and paste it into Gemini, ChatGPT or Claude to get a story.
              </li>
              <li>Copy the generated story and paste it into the script box above, then Generate video.</li>
            </ol>
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-2 text-xs leading-relaxed text-fg">
              {MASTER_PROMPT}
            </pre>
            <Button variant="secondary" onClick={copyPrompt} className="w-full sm:w-auto">
              {promptCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {promptCopied ? "Copied!" : "Copy master prompt"}
            </Button>
          </div>
        </details>

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
