/**
 * Multimodal understanding for the admin assistant — images, audio, video.
 * Small files only: everything is sent inline in one Gemini request, so the
 * whole payload must stay well under Gemini's ~20 MB inline limit.
 * Server-only.
 */
import "server-only";
import { canAttempt, recordSuccess, recordFailure, chainOpen, sleep, backoffDelay } from "./circuit";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-flash-lite-latest"];

/** Per-file ceiling. The combined request also can't exceed ~18 MB. */
export const MEDIA_MAX_BYTES = 15 * 1024 * 1024;
export const MEDIA_TOTAL_MAX_BYTES = 18 * 1024 * 1024;

const IMAGE = /^image\/(png|jpe?g|webp|gif|heic|heif)$/i;
const AUDIO = /^audio\/(mpeg|mp3|mp4|wav|x-wav|ogg|opus|webm|aac|flac|x-m4a|m4a|3gpp)$/i;
const VIDEO = /^video\/(mp4|mpeg|mov|quicktime|webm|3gpp|x-msvideo|x-matroska)$/i;

export function mediaKind(mime: string): "image" | "audio" | "video" | null {
  if (IMAGE.test(mime)) return "image";
  if (AUDIO.test(mime)) return "audio";
  if (VIDEO.test(mime)) return "video";
  return null;
}

/** Gemini is picky about a few mime strings — normalise the common ones. */
export function normalizeMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0].trim();
  const map: Record<string, string> = {
    "audio/mp3": "audio/mpeg",
    "audio/m4a": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "video/quicktime": "video/mov",
    "video/x-matroska": "video/webm",
  };
  return map[m] ?? m;
}

export interface MediaPart {
  mimeType: string;
  /** base64, no data: prefix */
  dataBase64: string;
  name?: string;
}

export function mediaConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * Ask Gemini about one or more media files. `context` is the surrounding chat
 * so the model knows what the admin actually wants.
 */
export async function analyzeMedia(
  parts: MediaPart[],
  prompt: string,
): Promise<{ text: string; model: string } | { error: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "Media understanding isn't configured." };
  if (!parts.length) return { error: "No media to analyse." };
  if (chainOpen(MODEL_CHAIN)) return { error: "The model is busy right now — try again shortly." };

  let total = 0;
  for (const p of parts) {
    const bytes = Math.ceil((p.dataBase64.length * 3) / 4);
    total += bytes;
    if (bytes > MEDIA_MAX_BYTES) return { error: `${p.name ?? "A file"} is over ${Math.round(MEDIA_MAX_BYTES / 1024 / 1024)} MB.` };
    if (!mediaKind(normalizeMime(p.mimeType))) return { error: `${p.name ?? "A file"} isn't a supported image / audio / video type.` };
  }
  if (total > MEDIA_TOTAL_MAX_BYTES) return { error: "Those files are too big to send together — try one at a time." };

  const contentParts = [
    ...parts.map((p) => ({ inlineData: { mimeType: normalizeMime(p.mimeType), data: p.dataBase64 } })),
    { text: prompt || "Describe this in detail. If it contains speech, transcribe it." },
  ];
  const body = {
    contents: [{ role: "user", parts: contentParts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
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
        console.error("analyzeMedia gemini", res.status, (await res.text()).slice(0, 200));
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
      return { text, model };
    } catch (e) {
      recordFailure(model);
      console.error("analyzeMedia failed", (e as Error).message);
      await sleep(backoffDelay(transient++));
    }
  }
  return { error: "Couldn't analyse the media right now. Try again shortly." };
}
