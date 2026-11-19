import { NextRequest, NextResponse } from "next/server";
import { engineFetch, resolveToolCaller, verifyTicket } from "@/lib/services/tools";
import { SITE_UPLOAD_MAX_BYTES, TRANSCRIBE_MAX_BYTES } from "@/lib/services/converter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"];

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  bn: "Bengali",
};

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/** One Gemini generateContent call with a model fallback chain. */
async function gemini(
  key: string,
  parts: GeminiPart[],
  opts: { temperature?: number; maxOutputTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const requestBody = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.1,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
    },
  };

  let lastError = "The transcriber failed.";
  for (const model of MODEL_CHAIN) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      });
      if (!r.ok) {
        lastError = r.status === 429 ? "The transcriber is busy — try again in a minute." : "Transcription failed.";
        continue;
      }
      const json = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
      if (text) return text;
      lastError = "The transcriber returned nothing — try a clearer clip.";
    } catch (e) {
      lastError = (e as Error).name === "TimeoutError" ? "Transcription timed out — try a shorter clip." : "Transcription failed.";
    }
  }
  throw new Error(lastError);
}

function transcribePrompt(language: string): string {
  const langHint =
    language && language !== "auto"
      ? `The audio is in ${LANGUAGE_NAMES[language] ?? language}.`
      : "Detect the language automatically.";
  return (
    `Transcribe this audio file word for word. ${langHint}\n\n` +
    "Rules:\n" +
    "- Output ONLY the transcript text, no preamble, no commentary.\n" +
    "- Keep natural punctuation and paragraph breaks.\n" +
    "- If a word is inaudible, write [inaudible].\n" +
    "- If the audio contains no speech, output exactly: [no speech detected]"
  );
}

const LLM_NOTES: Record<string, string> = {
  universal: "",
  claude: "Optimise for Claude: use XML tags for structure and be explicit about reasoning steps.",
  chatgpt: "Optimise for ChatGPT: clear step-by-step instructions and a system-prompt friendly layout.",
  gemini: "Optimise for Gemini: leverage long context and use structured output formats.",
  copilot: "Optimise for GitHub Copilot: focus on code patterns and include file/context references.",
  cursor: "Optimise for Cursor: use @file references and leverage chat/composer modes.",
};

/** Ask Gemini to turn the transcript into a reusable skill document. */
async function buildSkillDoc(
  key: string,
  transcript: string,
  skillName: string,
  targetLLM: string,
): Promise<string> {
  const name = skillName.trim() || "Video Tutorial Skill";
  const note = LLM_NOTES[targetLLM] ?? "";
  const prompt =
    `You are an expert instructional designer. Turn the video transcript below into a reusable AI skill document.\n` +
    `Skill name: ${name}\nTarget LLM: ${targetLLM}. ${note}\n\n` +
    "Rules:\n" +
    "- Output ONLY GitHub-flavoured Markdown, starting with `# " + name + "`.\n" +
    "- Include: Description, When to Use, Prerequisites, Step-by-Step Instructions, Examples/Code, Tips & Troubleshooting, Verification, and Metadata.\n" +
    "- Extract real details from the transcript — do not invent steps.\n" +
    "- Keep code snippets exactly as spoken where possible.\n\n" +
    "Transcript:\n" +
    transcript.slice(0, 200_000);

  try {
    return await gemini(key, [{ text: prompt }], { temperature: 0.2, maxOutputTokens: 8192 });
  } catch {
    // Fall back to the deterministic template if the second pass fails.
    const date = new Date().toISOString().split("T")[0];
    return [
      `# ${name}`,
      "",
      `> **Generated from video tutorial** — ${date}${note ? `\n> **${note}**` : ""}`,
      "",
      "## Description",
      "This skill was generated from a video tutorial transcript. It captures the key concepts, steps and techniques demonstrated in the video.",
      "",
      "## When to Use",
      "- When you need to replicate the workflow shown in the tutorial",
      "- As a reference guide for the techniques covered",
      "",
      "## Prerequisites",
      "- Basic familiarity with the topic domain",
      "- Tools/software mentioned in the tutorial (if any)",
      "",
      "## Full Transcript",
      transcript,
      "",
      "## Metadata",
      `- **Skill Name**: ${name}`,
      "- **Source**: Video tutorial (auto-generated)",
      `- **Target LLM**: ${targetLLM}`,
      `- **Generated**: ${new Date().toISOString()}`,
    ].join("\n");
  }
}

/**
 * POST /api/converter/transcribe
 *
 * Two shapes:
 *   1. multipart — Audio → Text: the browser posts a small audio file.
 *   2. JSON `{ jobId, ticket, slug, language, skillName, targetLLM }` —
 *      Video → Text / Skill: the engine has already extracted a small mono
 *      audio track, so the site pulls it server-side (API key) and transcribes.
 *
 * Quota was charged by /api/converter.
 */
export async function POST(req: NextRequest) {
  const res = await resolveToolCaller(req, "converter");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 403 });

  const key = process.env.GEMINI_API_KEY_VIDEO || process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Transcription is not configured on this deployment." }, { status: 503 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  /* ── 2. video job → pull the extracted audio, then transcribe ─────────── */
  if (contentType.includes("application/json")) {
    let body: {
      jobId?: string;
      ticket?: string;
      slug?: string;
      language?: string;
      skillName?: string;
      targetLLM?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const jobId = String(body.jobId ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 32);
    const ticket = String(body.ticket ?? "");
    const slug = String(body.slug ?? "");
    if (!jobId) return NextResponse.json({ error: "Missing job id." }, { status: 400 });
    if (!verifyTicket(jobId, ticket)) {
      return NextResponse.json({ error: "That job ticket is invalid or expired." }, { status: 403 });
    }
    if (slug !== "video-to-text" && slug !== "video-to-skill") {
      return NextResponse.json({ error: "Unknown transcription job." }, { status: 400 });
    }

    let engine: Response;
    try {
      engine = await engineFetch(`/api/file/${jobId}`, { timeoutMs: 120_000 });
    } catch {
      return NextResponse.json({ error: "Could not fetch the extracted audio — try again." }, { status: 502 });
    }
    if (!engine.ok) {
      const detail = await engine.text().catch(() => "");
      let message = "The extracted audio is no longer available — run the conversion again.";
      try {
        message = JSON.parse(detail).error ?? message;
      } catch {}
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const declared = Number(engine.headers.get("content-length") ?? 0);
    if (declared > TRANSCRIBE_MAX_BYTES) {
      return NextResponse.json(
        { error: "That video is too long to transcribe. Try a shorter clip." },
        { status: 413 },
      );
    }

    const buf = Buffer.from(await engine.arrayBuffer());
    if (!buf.length) return NextResponse.json({ error: "The extracted audio was empty." }, { status: 502 });
    if (buf.length > TRANSCRIBE_MAX_BYTES) {
      return NextResponse.json({ error: "That video is too long to transcribe. Try a shorter clip." }, { status: 413 });
    }

    const language = String(body.language ?? "auto");
    let transcript: string;
    try {
      transcript = await gemini(key, [
        { text: transcribePrompt(language) },
        { inlineData: { mimeType: "audio/mpeg", data: buf.toString("base64") } },
      ]);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }

    if (slug === "video-to-skill") {
      const doc = await buildSkillDoc(key, transcript, String(body.skillName ?? ""), String(body.targetLLM ?? "universal"));
      return NextResponse.json({ text: doc, slug, transcript });
    }

    return NextResponse.json({ text: transcript, slug });
  }

  /* ── 1. multipart — small audio file posted by the browser ────────────── */
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the audio file as multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No audio file received." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > SITE_UPLOAD_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Audio → Text accepts files up to ${Math.round(SITE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB. Trim the clip first, or use Compress Audio.`,
      },
      { status: 413 },
    );
  }

  const language = String(form.get("language") ?? "auto");
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    const text = await gemini(key, [
      { text: transcribePrompt(language) },
      { inlineData: { mimeType: file.type || "audio/mpeg", data: buf.toString("base64") } },
    ]);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
