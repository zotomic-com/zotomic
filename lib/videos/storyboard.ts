/**
 * AI storyboard writer for the Video Generator (server-only).
 *
 * The user pastes ANY rough idea; Zotomic AI turns it into the engine's exact
 * storyboard format (timestamp headers + Visual/Audio/Colors/Voiceover lines).
 *
 * Design: Gemini returns STRUCTURED JSON (scenes with start/end seconds) and
 * this module formats it deterministically into the storyboard text the engine
 * parses. The engine therefore never sees AI-mangled formatting, and every
 * scene is validated (contiguous timestamps, ≤55s, word budget) before it is
 * returned — with one automatic repair pass when validation fails.
 *
 * API key: GEMINI_API_KEY_VIDEO (free-tier Google key — server env only,
 * never exposed to the frontend), falling back to the shared GEMINI_API_KEY.
 */
import "server-only";
import { canAttempt, recordSuccess, recordFailure, chainOpen, sleep, backoffDelay } from "@/lib/ai/circuit";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-flash-lite-latest"];

export const MAX_IDEA_CHARS = 2000;
const MAX_TOTAL_SECONDS = 55;
const MAX_VOICE_WORDS = 140;
const MIN_SCENES = 3;
const MAX_SCENES = 8;

/* ── prompt ──────────────────────────────────────────────────────────────── */

function writerPrompt(characterName: string, idea: string): string {
  return `You are the storyboard writer for Zotomic's AI video generator. Turn the user's idea into a short vertical video (maximum 50 seconds) that Zotomic renders as an animated stick-figure video with voiceover.

Return ONLY JSON in this exact shape:
{ "scenes": [
  { "title": "short scene title", "start": 0, "end": 8, "visual": "...", "audio": "...", "colors": "...", "voiceover": "..." }
] }

STRICT RULES:
1. Write ${MIN_SCENES} to 7 scenes. Timestamps are INTEGER seconds: the first scene starts at 0, scenes are contiguous (each scene starts exactly where the previous ended), and the last scene MUST end at 50 seconds or less.
2. "title": 2-5 words.
3. "visual": ONE simple action the main character does (walk, run, jump, wave, point, fall, celebrate, think, write at a desk, cook, dance, sit, sleep, wake up, stretch, cry, laugh, eat, drink, open a gift box, knock on a door, throw, catch, carry, push, climb, swim, bow). No camera directions, no close-ups, no zooms, no scene changes, max ~15 words. Mentioning an object in the visual shows it in the scene: gift box, door, window, table, chair, car, ball, TV, couch, bed, desk, tree (e.g. "opens the gift box", "sits on the couch", "knocks on the door").
4. "audio": sound effects or music mood, one short line.
5. "colors": the scene's background and element color mood (one short line), e.g. "sunny yellow morning with warm orange light". Each scene can have a different color mood that fits the story.
6. "voiceover": the narration for that scene, maximum 25 words, simple English words. Total across all scenes: maximum 120 words. No quotes inside.
7. The story has ONE main stick-figure character named "${characterName}" who appears in EVERY "visual" line.
8. Be concrete and fun — a real mini-story with a beginning, a twist and an ending. Output ONLY the JSON object, no markdown, no explanations.

THE USER'S IDEA:
"""${idea.slice(0, MAX_IDEA_CHARS)}"""`;
}

/* ── Gemini call (JSON mode) ─────────────────────────────────────────────── */

function apiKey(): string | null {
  return process.env.GEMINI_API_KEY_VIDEO || process.env.GEMINI_API_KEY || null;
}

async function geminiJson(parts: unknown[]): Promise<{ parsed: unknown } | { error: string }> {
  const key = apiKey();
  if (!key) return { error: "The AI writer isn't configured yet." };
  if (chainOpen(MODEL_CHAIN)) return { error: "The AI is busy right now — try again shortly." };

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: "application/json" },
  };

  let transient = 0;
  for (const model of MODEL_CHAIN) {
    if (!canAttempt(model)) continue;
    try {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        recordFailure(model);
        if ([404, 429, 503].includes(res.status)) {
          await sleep(backoffDelay(transient++));
          continue;
        }
        console.error("storyboard gemini", res.status, (await res.text()).slice(0, 200));
        continue;
      }
      const data = await res.json();
      const text: string =
        data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("").trim() ?? "";
      if (!text) {
        recordFailure(model);
        continue;
      }
      recordSuccess(model);
      try {
        return { parsed: JSON.parse(text) };
      } catch {
        // tolerate a fenced/wrapped JSON — grab the first {...} block
        const m = /\{[\s\S]*\}/.exec(text);
        if (m) {
          try {
            return { parsed: JSON.parse(m[0]) };
          } catch {
            /* fall through */
          }
        }
        recordFailure(model);
      }
    } catch (e) {
      recordFailure(model);
      console.error("storyboard gemini failed", (e as Error).message);
      await sleep(backoffDelay(transient++));
    }
  }
  return { error: "Couldn't write the storyboard right now. Try again shortly." };
}

/* ── validation ──────────────────────────────────────────────────────────── */

export interface StoryboardScene {
  title: string;
  start: number;
  end: number;
  visual: string;
  audio: string;
  colors: string;
  voiceover: string;
}

function validScene(s: unknown): s is StoryboardScene {
  const o = s as Partial<StoryboardScene>;
  return (
    typeof o.title === "string" &&
    typeof o.start === "number" &&
    typeof o.end === "number" &&
    typeof o.visual === "string" &&
    typeof o.audio === "string" &&
    typeof o.colors === "string" &&
    typeof o.voiceover === "string" &&
    o.visual.trim().length > 0 &&
    o.voiceover.trim().length > 0
  );
}

function storyboardProblems(scenes: StoryboardScene[]): string[] {
  const problems: string[] = [];
  if (scenes.length < MIN_SCENES) problems.push(`only ${scenes.length} scenes — write at least ${MIN_SCENES}.`);
  if (scenes.length > MAX_SCENES) problems.push(`${scenes.length} scenes is too many — keep it to 7 or fewer.`);
  if (scenes.length && scenes[0].start !== 0) problems.push("the first scene must start at 0 seconds.");
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (s.end <= s.start) problems.push(`scene ${i + 1} ("${s.title}") has end ≤ start.`);
    if (i > 0 && s.start < scenes[i - 1].end) problems.push(`scene ${i + 1} overlaps the previous scene.`);
  }
  const total = scenes.length ? scenes[scenes.length - 1].end : 0;
  if (total > MAX_TOTAL_SECONDS) problems.push(`the video is ${total}s — the last scene must end at ${MAX_TOTAL_SECONDS}s or less.`);
  if (total < 10) problems.push("the video is too short — make it at least ~15 seconds.");
  const words = scenes.reduce((n, s) => n + s.voiceover.trim().split(/\s+/).filter(Boolean).length, 0);
  if (words > MAX_VOICE_WORDS) problems.push(`the voiceover is ${words} words — keep the total at ${MAX_VOICE_WORDS} or less.`);
  return problems;
}

/* ── formatting (deterministic — the engine parses this) ─────────────────── */

function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatStoryboard(scenes: StoryboardScene[]): string {
  return (
    scenes
      .map(
        (s) =>
          `${clock(s.start)} - ${clock(s.end)} | ${s.title.trim()}\n` +
          `Visual: ${s.visual.trim()}\n` +
          `Audio: ${s.audio.trim()}\n` +
          `Colors: ${s.colors.trim()}\n` +
          `Voiceover: "${s.voiceover.trim()}"`,
      )
      .join("\n\n") + "\n"
  );
}

/* ── public entry ────────────────────────────────────────────────────────── */

function extractScenes(parsed: unknown): StoryboardScene[] {
  const arr = (parsed as { scenes?: unknown })?.scenes;
  return Array.isArray(arr) ? arr.filter(validScene) : [];
}

export async function writeStoryboard(input: {
  idea: string;
  characterName?: string; // the selected cast member's display name
}): Promise<{ storyboard: string; scenes: number; seconds: number; words: number } | { error: string }> {
  const characterName = (input.characterName || "the main character").slice(0, 24);
  const first = await geminiJson([{ text: writerPrompt(characterName, input.idea) }]);
  if ("error" in first) return first;

  let scenes = extractScenes(first.parsed);
  let problems = storyboardProblems(scenes);

  if (problems.length) {
    // one automatic repair pass with the specific issues
    const repair = await geminiJson([
      { text: writerPrompt(characterName, input.idea) },
      {
        text: `Your previous draft had these problems — fix ONLY them and return the corrected JSON:\n- ${problems.join("\n- ")}\n\nPrevious draft:\n${JSON.stringify(
          { scenes: scenes.map((s) => ({ ...s, voiceover: s.voiceover.slice(0, 200) })) },
        )}`,
      },
    ]);
    if ("error" in repair) return { error: repair.error };
    const fixed = extractScenes(repair.parsed);
    const fixedProblems = storyboardProblems(fixed);
    if (fixed.length && fixedProblems.length < problems.length) {
      scenes = fixed;
      problems = fixedProblems;
    }
  }

  if (!scenes.length) return { error: "The AI writer couldn't format the story — please try again." };
  if (problems.length) {
    return { error: `The AI wrote a story that doesn't fit the video limits (${problems[0]}) — try a shorter idea.` };
  }

  return {
    storyboard: formatStoryboard(scenes),
    scenes: scenes.length,
    seconds: scenes[scenes.length - 1].end,
    words: scenes.reduce((n, s) => n + s.voiceover.trim().split(/\s+/).filter(Boolean).length, 0),
  };
}
