import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConvertToASCII, ConvertToUnicode } from "unicode2ascii";
import { resolveToolCaller } from "@/lib/services/tools";
import { getConvType, normalizeConvOptions, SITE_TEXT_TYPES } from "@/lib/services/converter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"];

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  bn: "Bengali",
  hi: "Hindi",
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
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
  ms: "Malay",
  tl: "Filipino",
};

/* ── Bijoy ⇄ Unicode ─────────────────────────────────────────────────────── */
/* unicode2ascii implements the real Bijoy/SutonnyMJ ANSI mapping, including
 * conjunct glyphs and the pre-base reordering of ে / ি / ৈ. The previous
 * hand-written table mapped letters to "A" + a letter and produced nonsense,
 * so it has been replaced. */

function unicodeToBijoy(text: string): string {
  return ConvertToASCII("bijoy", text);
}

function bijoyToUnicode(text: string): string {
  return ConvertToUnicode("bijoy", text);
}

/* ── text helpers ────────────────────────────────────────────────────────── */

function convertCase(text: string, caseType: string): string {
  switch (caseType) {
    case "lower":
      return text.toLowerCase();
    case "upper":
      return text.toUpperCase();
    case "title":
      return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    case "sentence":
      return text.replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
    case "camel":
      return text
        .replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (m, i) => (i === 0 ? m.toLowerCase() : m.toUpperCase()))
        .replace(/\s+/g, "");
    case "pascal":
      return text.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (m) => m.toUpperCase()).replace(/\s+/g, "");
    case "snake":
      return text.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    case "kebab":
      return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    case "alternating":
      return text
        .split("")
        .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
        .join("");
    case "inverse":
      return text
        .split("")
        .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
        .join("");
    default:
      return text;
  }
}

function encodeDecodeText(text: string, type: string): string {
  try {
    switch (type) {
      case "base64-encode":
        return Buffer.from(text, "utf8").toString("base64");
      case "base64-decode":
        return Buffer.from(text, "base64").toString("utf8");
      case "url-encode":
        return encodeURIComponent(text);
      case "url-decode":
        return decodeURIComponent(text);
      case "html-encode":
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      case "html-decode":
        return text
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, "&");
      case "rot13":
        return text.replace(/[a-zA-Z]/g, (c) => {
          const code = c.charCodeAt(0);
          const base = code <= 90 ? 65 : 97;
          return String.fromCharCode(((code - base + 13) % 26) + base);
        });
      case "hex-encode":
        return Buffer.from(text, "utf8").toString("hex");
      case "hex-decode":
        return Buffer.from(text, "hex").toString("utf8");
      default:
        return text;
    }
  } catch (e) {
    throw new Error(`Could not ${type.replace("-", " ")}: ${(e as Error).message}`);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(text: string): string {
  const buf = Buffer.from(text, "utf8");
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

function generateHash(text: string, type: string): string {
  if (type === "crc32") return crc32(text);
  const algo = type === "sha1" ? "sha1" : type === "sha256" ? "sha256" : type === "sha512" ? "sha512" : type === "ripemd160" ? "ripemd160" : "md5";
  return crypto.createHash(algo).update(text, "utf8").digest("hex");
}

function generateDiff(text1: string, text2: string): string {
  const lines1 = text1.split("\n");
  const lines2 = text2.split("\n");
  const maxLen = Math.max(lines1.length, lines2.length);
  let diff = "";
  for (let i = 0; i < maxLen; i++) {
    const l1 = lines1[i];
    const l2 = lines2[i];
    if (l1 === l2) {
      diff += `  ${l1}\n`;
    } else {
      if (l1 !== undefined) diff += `- ${l1}\n`;
      if (l2 !== undefined) diff += `+ ${l2}\n`;
    }
  }
  return diff;
}

function countText(text: string): string {
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, "").length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lines = text.split("\n").length;
  const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/).length : 0;
  const bytes = Buffer.byteLength(text, "utf8");
  const minutes = words / 200;
  const reading = minutes < 1 ? `${Math.max(1, Math.round(minutes * 60))} sec` : `${Math.round(minutes)} min`;
  return [
    `Characters: ${chars}`,
    `Characters (no spaces): ${charsNoSpace}`,
    `Words: ${words}`,
    `Lines: ${lines}`,
    `Paragraphs: ${paragraphs}`,
    `Bytes (UTF-8): ${bytes}`,
    `Reading time: ~${reading}`,
  ].join("\n");
}

async function translateText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY_VIDEO || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Translation is not configured on this deployment.");

  const target = LANGUAGE_NAMES[targetLang] ?? targetLang;
  const source =
    sourceLang && sourceLang !== "auto" ? `The text is in ${LANGUAGE_NAMES[sourceLang] ?? sourceLang}.` : "Detect the source language automatically.";

  const prompt =
    `Translate the following text into ${target}. ${source}\n\n` +
    "Rules:\n" +
    "- Output ONLY the translation, with no preamble or commentary.\n" +
    "- Preserve line breaks, punctuation and formatting.\n" +
    "- Keep names, numbers and code unchanged.\n\n" +
    "Text:\n" +
    text.slice(0, 100_000);

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  };

  let lastError = "Translation failed.";
  for (const model of MODEL_CHAIN) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) {
        lastError = r.status === 429 ? "The translator is busy — try again in a minute." : "Translation failed.";
        continue;
      }
      const json = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const out = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
      if (out) return out;
      lastError = "The translator returned nothing — try again.";
    } catch (e) {
      lastError = (e as Error).name === "TimeoutError" ? "Translation timed out — try a shorter text." : "Translation failed.";
    }
  }
  throw new Error(lastError);
}

/* ── route ───────────────────────────────────────────────────────────────── */

/**
 * POST /api/converter/run — the site-side text converters.
 *
 * multipart: `slug`, `options` (JSON), and (for Text Diff) two `files`.
 * Quota was charged by /api/converter, so this only re-checks access.
 */
export async function POST(req: NextRequest) {
  const res = await resolveToolCaller(req, "converter");
  if (!res.caller) return NextResponse.json({ error: res.error }, { status: res.status ?? 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the request as multipart/form-data." }, { status: 400 });
  }

  const slug = String(form.get("slug") ?? "").trim();
  if (!SITE_TEXT_TYPES.has(slug)) {
    return NextResponse.json({ error: "That converter does not run here." }, { status: 400 });
  }

  const type = await getConvType(slug);
  if (!type || !type.enabled) {
    return NextResponse.json({ error: "That converter is not available." }, { status: 404 });
  }

  let options: Record<string, string | number>;
  try {
    const raw = JSON.parse(String(form.get("options") ?? "{}")) as Record<string, unknown>;
    options = normalizeConvOptions(type, raw);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const text = String(options.text ?? "");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  try {
    let out = "";
    switch (slug) {
      case "text-translate": {
        if (!text.trim()) return NextResponse.json({ error: "Enter some text to translate." }, { status: 400 });
        out = await translateText(text, String(options.sourceLang ?? "auto"), String(options.targetLang ?? "en"));
        break;
      }
      case "unicode-to-bijoy":
        if (!text.trim()) return NextResponse.json({ error: "Enter some Unicode text first." }, { status: 400 });
        out = unicodeToBijoy(text);
        break;
      case "bijoy-to-unicode":
        if (!text.trim()) return NextResponse.json({ error: "Enter some Bijoy text first." }, { status: 400 });
        out = bijoyToUnicode(text);
        break;
      case "text-case":
        if (!text.trim()) return NextResponse.json({ error: "Enter some text first." }, { status: 400 });
        out = convertCase(text, String(options.caseType ?? "lower"));
        break;
      case "text-encode":
        if (!text.trim()) return NextResponse.json({ error: "Enter some text first." }, { status: 400 });
        out = encodeDecodeText(text, String(options.encodeType ?? "base64-encode"));
        break;
      case "text-hash":
        if (!text.trim()) return NextResponse.json({ error: "Enter some text first." }, { status: 400 });
        out = generateHash(text, String(options.hashType ?? "md5"));
        break;
      case "text-diff": {
        if (files.length < 2) {
          return NextResponse.json({ error: "Choose two text files to compare." }, { status: 400 });
        }
        if (files.some((f) => f.size > 2 * 1024 * 1024)) {
          return NextResponse.json({ error: "Text Diff accepts files up to 2 MB each." }, { status: 413 });
        }
        const [a, b] = await Promise.all([files[0].text(), files[1].text()]);
        out = generateDiff(a, b);
        break;
      }
      case "text-count":
        if (!text.trim()) return NextResponse.json({ error: "Enter some text first." }, { status: 400 });
        out = countText(text);
        break;
      default:
        return NextResponse.json({ error: "Unknown text converter." }, { status: 400 });
    }

    return NextResponse.json({ text: out, slug });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Conversion failed." }, { status: 502 });
  }
}
