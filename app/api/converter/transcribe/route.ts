import { NextRequest, NextResponse } from "next/server";
import { resolveToolCaller } from "@/lib/services/tools";
import { SITE_UPLOAD_MAX_BYTES } from "@/lib/services/converter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * POST /api/converter/transcribe — Audio → Text.
 *
 * Gemini reads the audio inline, so this is the only converter that posts its
 * file to the site (Vercel caps request bodies at ~4.5 MB — plenty for a voice
 * note, not for a long podcast). Quota was already charged by /api/converter.
 */
export async function POST(req: NextRequest) {
  const res = await resolveToolCaller(req, "converter");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 403 });

  const key = process.env.GEMINI_API_KEY_VIDEO || process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Transcription is not configured on this deployment." }, { status: 503 });
  }

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
  const langHint =
    language && language !== "auto"
      ? `The audio is in ${LANGUAGE_NAMES[language] ?? language}.`
      : "Detect the language automatically.";

  const buf = Buffer.from(await file.arrayBuffer());
  const data = buf.toString("base64");
  const mimeType = file.type || "audio/mpeg";

  const prompt =
    `Transcribe this audio file word for word. ${langHint}\n\n` +
    "Rules:\n" +
    "- Output ONLY the transcript text, no preamble, no commentary.\n" +
    "- Keep natural punctuation and paragraph breaks.\n" +
    "- If a word is inaudible, write [inaudible].\n" +
    "- If the audio contains no speech, output exactly: [no speech detected]";

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  };

  let lastError = "Transcription failed.";
  for (const model of MODEL_CHAIN) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120_000),
        },
      );
      if (!r.ok) {
        lastError = r.status === 429 ? "The transcriber is busy — try again in a minute." : "Transcription failed.";
        continue;
      }
      const json = (await r.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text =
        json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
      if (text) return NextResponse.json({ text, model });
      lastError = "The transcriber returned nothing — try a clearer clip.";
    } catch (e) {
      lastError = (e as Error).name === "TimeoutError" ? "Transcription timed out — try a shorter clip." : "Transcription failed.";
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}
