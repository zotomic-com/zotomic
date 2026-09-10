/**
 * The admin assistant's shared workspace — a private Supabase Storage bucket
 * that Zotomic and the admin both see. Text files come back as text; media
 * comes back base64 for analyzeMedia. Server-only.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { mediaKind, MEDIA_MAX_BYTES } from "./media";

export const WORKSPACE_BUCKET = "assistant-workspace";
export const WORKSPACE_MAX_WRITE_BYTES = 2 * 1024 * 1024; // 2 MB for text writes

/** Reject traversal / absolute / weird paths; return a clean relative path. */
export function cleanWorkspacePath(input: string): string | null {
  const p = String(input || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .trim();
  if (!p || p.length > 400) return null;
  if (p.startsWith("/") || p.includes("..") || p.includes("\0")) return null;
  if (p.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  return p;
}

const EXT_MIME: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  js: "text/javascript", ts: "text/typescript", tsx: "text/typescript", jsx: "text/javascript",
  sql: "application/sql", html: "text/html", css: "text/css", yml: "text/yaml", yaml: "text/yaml",
  env: "text/plain", sh: "text/x-shellscript",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  heic: "image/heic", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
  opus: "audio/opus", mp4: "video/mp4", mov: "video/mov", webm: "video/webm",
};
export function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}
const TEXTUAL = /^(text\/|application\/(json|sql|xml|javascript|typescript|x-yaml))/;

export interface WorkspaceEntry {
  path: string;
  size: number;
  updatedAt: string | null;
}

export async function listWorkspace(prefix = ""): Promise<WorkspaceEntry[]> {
  const clean = prefix ? cleanWorkspacePath(prefix) ?? "" : "";
  const db = getAdminSupabase();
  const out: WorkspaceEntry[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > 4) return;
    const { data } = await db.storage.from(WORKSPACE_BUCKET).list(dir, { limit: 200, sortBy: { column: "name", order: "asc" } });
    for (const item of data ?? []) {
      const full = dir ? `${dir}/${item.name}` : item.name;
      if (item.id === null || item.metadata == null) {
        // a "folder" placeholder
        await walk(full, depth + 1);
      } else {
        out.push({
          path: full,
          size: Number(item.metadata?.size ?? 0),
          updatedAt: (item.updated_at as string) ?? (item.created_at as string) ?? null,
        });
      }
    }
  }
  await walk(clean, 0);
  return out.slice(0, 300);
}

export async function readWorkspaceFile(
  rawPath: string,
): Promise<
  | { ok: true; path: string; mimeType: string; size: number; kind: "text" | "media" | "binary"; text?: string; base64?: string }
  | { error: string }
> {
  const path = cleanWorkspacePath(rawPath);
  if (!path) return { error: "Bad file path." };
  const { data, error } = await getAdminSupabase().storage.from(WORKSPACE_BUCKET).download(path);
  if (error || !data) return { error: `Couldn't read ${path} — it may not exist.` };
  const buf = Buffer.from(await data.arrayBuffer());
  const mimeType = data.type && data.type !== "application/json" ? data.type : mimeForPath(path);
  const size = buf.length;

  if (mediaKind(mimeType)) {
    if (size > MEDIA_MAX_BYTES) return { error: `${path} is too large to analyse (${(size / 1024 / 1024).toFixed(1)} MB).` };
    return { ok: true, path, mimeType, size, kind: "media", base64: buf.toString("base64") };
  }
  if (TEXTUAL.test(mimeType) || size < 512 * 1024) {
    return { ok: true, path, mimeType, size, kind: "text", text: buf.toString("utf8").slice(0, 200_000) };
  }
  return { ok: true, path, mimeType, size, kind: "binary" };
}

export async function writeWorkspaceFile(
  rawPath: string,
  content: string,
): Promise<{ ok: true; path: string; size: number } | { error: string }> {
  const path = cleanWorkspacePath(rawPath);
  if (!path) return { error: "Bad file path." };
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > WORKSPACE_MAX_WRITE_BYTES) return { error: `That's ${(bytes / 1024 / 1024).toFixed(1)} MB — over the 2 MB write limit.` };
  const { error } = await getAdminSupabase()
    .storage.from(WORKSPACE_BUCKET)
    .upload(path, new Blob([content], { type: mimeForPath(path) }), { upsert: true });
  if (error) return { error: `Couldn't write ${path}: ${error.message}` };
  return { ok: true, path, size: bytes };
}

export async function deleteWorkspaceFile(rawPath: string): Promise<{ ok: true; path: string } | { error: string }> {
  const path = cleanWorkspacePath(rawPath);
  if (!path) return { error: "Bad file path." };
  const { error } = await getAdminSupabase().storage.from(WORKSPACE_BUCKET).remove([path]);
  if (error) return { error: `Couldn't delete ${path}: ${error.message}` };
  return { ok: true, path };
}
