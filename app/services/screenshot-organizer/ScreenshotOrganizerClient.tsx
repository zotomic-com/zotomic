"use client";

/**
 * Screenshot Organizer client.
 *
 * Privacy model: the ORIGINAL image never leaves the device. Only a
 * downscaled analysis copy (JPEG ≤1024px) goes to the server, and only a
 * small thumbnail + the extracted text are stored (auto-deleted after 24h).
 *
 * Intake: upload (single/multi), device folder connect (File System Access
 * API), and an in-app screenshot taker (full screen / active tab full page /
 * selection). After capture a details modal asks for name / group / details /
 * link — user answers are passed to Zotomic AI as hints.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Copy, Download, FolderOpen, Link2, Loader2, Pencil, RefreshCw, ShieldCheck, Trash2, Upload, X, AlertTriangle } from "lucide-react";

/* ── types mirroring the API ─────────────────────────────────────────────── */

interface RecoveredLink {
  url: string;
  verdict: "verified" | "probable" | "suggestion";
  details: string;
}

interface Item {
  id: string;
  group_id: string | null;
  name: string;
  details: string;
  user_link: string;
  thumb: string;
  analysis: {
    title?: string;
    key_info?: string;
    category?: string;
    source_app?: string;
    text?: string;
    tags?: string[];
    sensitive?: boolean;
    why?: string;
    links?: string[];
  };
  recovered_links: RecoveredLink[];
  status: "pending" | "ready" | "error";
  error: string | null;
}

interface Group {
  id: string;
  name: string;
}

interface SessionData {
  session: { id: string; title: string; expires_at: string };
  groups: Group[];
  items: Item[];
  linksText: string;
  notesText: string;
}

interface QuotaInfo {
  plan: string;
  screenshots: { used: number; limit: number };
  recoveries: { used: number; limit: number };
}

/* ── image helpers (all client-side) ────────────────────────────────────── */

async function downscale(file: Blob, maxSide: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function suggestName(a: { source_app?: string; title?: string } | null, fallback: string): string {
  const base = (a?.source_app || a?.title || fallback).replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return base ? base.toLowerCase() : "screenshot";
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i;

/* ── component ──────────────────────────────────────────────────────────── */

export default function ScreenshotOrganizerClient({ signedIn }: { signedIn: boolean }) {
  const [consent, setConsent] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // details modal (after capture / edit)
  const [modal, setModal] = useState<null | {
    mode: "new" | "edit";
    itemId?: string;
    preview?: string;       // dataURL of a freshly captured image
    full?: Blob;            // full-size blob of a freshly captured image
    name: string;
    group: string;
    details: string;
    link: string;
  }>(null);

  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [hasDirHandle, setHasDirHandle] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  // itemId → the original image Blob, kept in memory on this device only so
  // the screenshot can be downloaded (the server never stores full images).
  const blobsRef = useRef(new Map<string, Blob>());

  useEffect(() => {
    fetch("/api/services/tools/screenshots/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => q && setQuota(q))
      .catch(() => {});
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }, []);

  const loadSession = useCallback(async (id: string) => {
    const r = await fetch(`/api/services/tools/screenshots/session/${id}`);
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Could not load the session.");
      return;
    }
    setSession(d);
    // drop in-memory images for items that no longer exist (deleted / expired)
    const ids = new Set(((d.items ?? []) as Array<{ id: string }>).map((i) => i.id));
    for (const id of [...blobsRef.current.keys()]) if (!ids.has(id)) blobsRef.current.delete(id);
    dirInputRef.current?.setAttribute("data-loaded", "1");
  }, []);

  /* ── intake → details modal → analyze ─────────────────────────────────── */

  const openDetailsForFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/") || IMAGE_RE.test(f.name));
    if (!images.length) {
      setError("No images found in that selection.");
      return;
    }
    setError("");
    const f = images[0];
    const preview = await downscale(f, 1024, 0.72);
    setModal({ mode: "new", preview, full: f, name: suggestName({ title: f.name.replace(/\.[a-z0-9]+$/i, "") }, f.name), group: "", details: "", link: "" });
    (window as unknown as { __zoFiles?: File[] }).__zoFiles = images; // staged batch
  }, []);

  const onUploadClick = () => fileInputRef.current?.click();
  const onFolderFallback = () => dirInputRef.current?.click();

  const pickDeviceFolder = useCallback(async () => {
    const picker = (window as unknown as { showDirectoryPicker?: (o?: unknown) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      onFolderFallback();
      return;
    }
    try {
      const handle = await picker.call(window, { mode: "readwrite" });
      dirHandleRef.current = handle;
      setHasDirHandle(true);
      const files: File[] = [];
      for await (const entry of (handle as unknown as { values: () => AsyncIterable<{ getFile: () => Promise<File>; name: string }> }).values()) {
        if (entry.name && IMAGE_RE.test(entry.name)) {
          const f = await entry.getFile();
          files.push(f);
          if (files.length >= 40) break; // sane cap per run
        }
      }
      flash(`Folder connected — ${files.length} screenshot${files.length === 1 ? "" : "s"} found.`);
      if (files.length) await openDetailsForFiles(files);
    } catch {
      /* user cancelled */
    }
  }, [flash, openDetailsForFiles]);

  /* ── screenshot taker ─────────────────────────────────────────────────── */

  const grabFrame = useCallback(async (opts?: MediaStreamConstraints & { preferCurrentTab?: boolean }): Promise<Blob | null> => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 } as MediaTrackConstraints,
      ...opts,
    } as DisplayMediaStreamOptions);
    const track = stream.getVideoTracks()[0];
    const video = document.createElement("video");
    video.srcObject = new MediaStream([track]);
    await video.play();
    await new Promise((r) => setTimeout(r, 350)); // let the picker overlay fade
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    stream.getTracks().forEach((t) => t.stop());
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  }, []);

  const takeScreen = useCallback(async () => {
    try {
      const blob = await grabFrame();
      if (blob) await afterCapture(blob, "screen");
    } catch {
      /* cancelled */
    }
  }, [grabFrame]);

  const takeFullPage = useCallback(async () => {
    // Active-tab full page: share the current tab, then scroll-and-stitch.
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 } as MediaTrackConstraints,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);
      const track = stream.getVideoTracks()[0];
      const video = document.createElement("video");
      video.srcObject = new MediaStream([track]);
      await video.play();
      await new Promise((r) => setTimeout(r, 350));

      const scroller = document.scrollingElement!;
      const vh = window.innerHeight;
      const total = Math.min(scroller.scrollHeight, vh * 8); // cap: 8 viewports
      const steps = Math.ceil(total / vh);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      const parts: HTMLCanvasElement[] = [];
      for (let i = 0; i < steps; i++) {
        window.scrollTo(0, i * vh);
        await new Promise((r) => setTimeout(r, 260));
        ctx.drawImage(video, 0, 0);
        const c = document.createElement("canvas");
        c.width = canvas.width;
        c.height = Math.round((canvas.height * Math.min(vh, total - i * vh)) / vh);
        c.getContext("2d")!.drawImage(canvas, 0, 0, canvas.width, c.height, 0, 0, canvas.width, c.height);
        parts.push(c);
        if (i * vh + vh >= total) break;
      }
      window.scrollTo(0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const H = parts.reduce((s, p) => s + p.height, 0);
      const out = document.createElement("canvas");
      out.width = parts[0].width;
      out.height = H;
      const octx = out.getContext("2d")!;
      let y = 0;
      for (const p of parts) {
        octx.drawImage(p, 0, y);
        y += p.height;
      }
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
      if (blob) await afterCapture(blob, "fullpage");
    } catch {
      /* cancelled or unsupported */
    }
  }, []);

  const takeSelection = useCallback(async () => {
    try {
      const blob = await grabFrame();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const img = document.createElement("img");
      img.src = url;
      await img.decode();
      // overlay + crop box
      const overlay = document.createElement("div");
      Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "9999", background: "rgba(0,0,0,.55)", cursor: "crosshair" } as CSSStyleDeclaration);
      const box = document.createElement("div");
      Object.assign(box.style, { position: "absolute", border: "2px solid #22d3ee", background: "rgba(34,211,238,.12)", display: "none" } as CSSStyleDeclaration);
      overlay.appendChild(box);
      const hint = document.createElement("div");
      hint.textContent = "Drag to select the area — release to capture, Esc to cancel";
      Object.assign(hint.style, { position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)", color: "#fff", font: "600 14px system-ui", zIndex: "10000" } as CSSStyleDeclaration);
      overlay.appendChild(hint);
      document.body.appendChild(overlay);
      let sx = 0, sy = 0, active = false, rx0 = 0, ry0 = 0;
      const toImg = (e: MouseEvent) => {
        const r = overlay.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * img.naturalWidth, ((e.clientY - r.top) / r.height) * img.naturalHeight];
      };
      const onDown = (e: MouseEvent) => {
        active = true;
        [sx, sy] = toImg(e);
        rx0 = e.clientX; ry0 = e.clientY;
        box.style.display = "block";
      };
      const onMove = (e: MouseEvent) => {
        if (!active) return;
        Object.assign(box.style, { left: `${Math.min(rx0, e.clientX)}px`, top: `${Math.min(ry0, e.clientY)}px`, width: `${Math.abs(e.clientX - rx0)}px`, height: `${Math.abs(e.clientY - ry0)}px` } as CSSStyleDeclaration);
      };
      const onUp = (e: MouseEvent) => {
        if (!active) return;
        active = false;
        const [ex, ey] = toImg(e);
        const x0 = Math.max(0, Math.min(sx, ex)), y0 = Math.max(0, Math.min(sy, ey));
        const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
        cleanup();
        if (w < 8 || h < 8) return;
        const c = document.createElement("canvas");
        c.width = Math.round(w); c.height = Math.round(h);
        c.getContext("2d")!.drawImage(img, x0, y0, w, h, 0, 0, c.width, c.height);
        c.toBlob((b) => b && afterCapture(b, "selection"), "image/png");
      };
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cleanup(); };
      function cleanup() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        hint.remove();
        URL.revokeObjectURL(url);
      }
      overlay.addEventListener("mousedown", onDown);
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("keydown", onKey);
    } catch {
      /* cancelled */
    }
  }, [grabFrame]);

  const afterCapture = useCallback(async (blob: Blob, kind: string) => {
    const preview = await downscale(blob, 1024, 0.72);
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    setModal({
      mode: "new",
      preview,
      full: blob,
      name: suggestName({ title: `${kind}_${stamp}` }, `${kind}_${stamp}`),
      group: "",
      details: "",
      link: "",
    });
    (window as unknown as { __zoFiles?: File[] }).__zoFiles = undefined;
  }, []);

  /* ── submit the details modal (batch when files were staged) ──────────── */

  const submitDetails = useCallback(async () => {
    if (!modal) return;
    setBusy("Analyzing with Zotomic AI…");
    setError("");
    try {
      const staged = (window as unknown as { __zoFiles?: File[] }).__zoFiles;
      const batch = staged ?? [];
      // Build the request items: first = the modal's image; rest = staged files
      const items: Array<{ name: string; dataUrl: string; thumb: string; group?: string; details?: string; link?: string }> = [];
      const blobs: Array<Blob | undefined> = []; // parallel to items — the original images
      if (modal.preview) {
        const thumb = modal.full ? await downscale(modal.full, 256, 0.6) : "";
        items.push({ name: modal.name, dataUrl: modal.preview, thumb, group: modal.group || undefined, details: modal.details || undefined, link: modal.link || undefined });
        blobs.push(modal.full);
      }
      for (const f of batch.slice(1)) {
        const dataUrl = await downscale(f, 1024, 0.72);
        const thumb = await downscale(f, 256, 0.6);
        items.push({ name: f.name.replace(IMAGE_RE, ""), dataUrl, thumb, group: modal.group || undefined, details: modal.details || undefined, link: modal.link || undefined });
        blobs.push(f);
      }
      (window as unknown as { __zoFiles?: File[] }).__zoFiles = undefined;

      // send in chunks of 2 (body limit safety)
      let last: { sessionId?: string } = {};
      for (let i = 0; i < items.length; i += 2) {
        const chunk = items.slice(i, i + 2);
        const chunkBlobs = blobs.slice(i, i + 2);
        const r = await fetch("/api/services/tools/screenshots/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: last.sessionId ?? session?.session.id, consent: true, items: chunk }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Analysis failed.");
        last = d;
        // link each created item to its original image (order-aligned)
        if (Array.isArray(d.created)) {
          d.created.forEach((c: { item?: { id: string } }, j: number) => {
            if (c?.item && chunkBlobs[j]) blobsRef.current.set(c.item.id, chunkBlobs[j]);
          });
        }
      }
      setModal(null);
      await loadSession(last.sessionId!);
      await fetch("/api/services/tools/screenshots/me").then((r) => (r.ok ? r.json() : null)).then((q) => q && setQuota(q));
      flash(`Zotomic AI analyzed ${items.length} screenshot${items.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [modal, session, loadSession, flash]);

  /* ── item + group management ──────────────────────────────────────────── */

  const patchSession = useCallback(async (sessionId: string, action: string, fields: Record<string, unknown>) => {
    const r = await fetch(`/api/services/tools/screenshots/session/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...fields }),
    });
    return r.ok;
  }, []);

  const updateItem = useCallback(async (itemId: string, fields: Record<string, unknown>) => {
    if (!session) return;
    setBusy("Saving…");
    try {
      const r = await fetch(`/api/services/tools/screenshots/session/${session.session.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, ...fields }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await loadSession(session.session.id);
      flash("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [session, loadSession, flash]);

  const deleteItem = useCallback(async (itemId: string) => {
    if (!session) return;
    setBusy("Deleting…");
    try {
      const r = await fetch(`/api/services/tools/screenshots/session/${session.session.id}?itemId=${itemId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      await loadSession(session.session.id);
      flash("Screenshot deleted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [session, loadSession, flash]);

  const recover = useCallback(async (itemId: string) => {
    if (!session) return;
    setBusy("Recovering links…");
    try {
      const r = await fetch("/api/services/tools/screenshots/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.session.id, itemId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await loadSession(session.session.id);
      const found = (d.links ?? []).length;
      flash(found ? `${found} link${found === 1 ? "" : "s"} recovered.` : "No links found for this one.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [session, loadSession, flash]);

  const addGroup = useCallback(async (name: string) => {
    if (!session || !name.trim()) return;
    await patchSession(session.session.id, "addGroup", { name });
    await loadSession(session.session.id);
  }, [session, patchSession, loadSession]);

  const renameGroup = useCallback(async (groupId: string, name: string) => {
    if (!session || !name.trim()) return;
    await patchSession(session.session.id, "renameGroup", { groupId, name });
    await loadSession(session.session.id);
  }, [session, patchSession, loadSession]);

  const deleteGroup = useCallback(async (groupId: string) => {
    if (!session) return;
    setBusy("Deleting…");
    try {
      const r = await fetch(`/api/services/tools/screenshots/session/${session.session.id}?groupId=${groupId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      await loadSession(session.session.id);
      flash("Group deleted (screenshots kept, now ungrouped).");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [session, loadSession, flash]);

  const download = (text: string, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Download the screenshot image itself (the original still lives on this device). */
  const downloadImage = (it: Item) => {
    const blob = blobsRef.current.get(it.id);
    if (!blob) return;
    const ext = blob.type === "image/png" ? ".png" : blob.type === "image/webp" ? ".webp" : ".jpg";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${it.name.replace(/[\\/:*?"<>|]+/g, "_")}${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  /** Write links.txt + notes.txt back into the connected device folder. */
  const writeBack = useCallback(async () => {
    const handle = dirHandleRef.current;
    if (!handle || !session) {
      setError("Connect your screenshots folder first (that's the folder the organized files are written into).");
      return;
    }
    try {
      const dir = await (handle as unknown as { getDirectoryHandle: (n: string, o?: unknown) => Promise<FileSystemDirectoryHandle> }).getDirectoryHandle("Zotomic-Organized", { create: true });
      const w = async (name: string, text: string) => {
        const fh = await (dir as unknown as { getFileHandle: (n: string, o?: unknown) => Promise<FileSystemFileHandle> }).getFileHandle(name, { create: true });
        const writable = await (fh as unknown as { createWritable: () => Promise<WritableStream> }).createWritable();
        await new Response(text).body!.pipeTo(writable);
      };
      await w("links.txt", session.linksText);
      await w("notes.txt", session.notesText);
      flash("Written into your folder → Zotomic-Organized/links.txt + notes.txt");
    } catch {
      setError("Couldn't write into the folder — the browser permission may have expired. Reconnect it.");
    }
  }, [session, flash]);

  /* ── render ───────────────────────────────────────────────────────────── */

  const groupNameOf = (it: Item) => session?.groups.find((g) => g.id === it.group_id)?.name ?? "Ungrouped";
  const grouped = new Map<string, Item[]>();
  for (const it of session?.items ?? []) {
    const g = groupNameOf(it);
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(it);
  }

  return (
    <div className="space-y-4">
      {/* consent + privacy */}
      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="flex items-center gap-2 font-bold text-fg"><ShieldCheck className="h-4 w-4 text-emerald-500" /> How your screenshots are handled</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-fg-muted">
          <li><b>Your original images never leave your device.</b> Only a small downscaled analysis copy is sent, used once to extract info, then discarded.</li>
          <li>Stored on Zotomic: a tiny thumbnail + extracted text + links — all <b>auto-deleted after 24 hours</b>.</li>
          <li>Folder connect uses your browser&apos;s permission dialog: Zotomic can only read the <b>folder you choose</b>, never your whole device.</li>
        </ul>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span>
            I agree: Zotomic may read the screenshots I add, use AI to extract text, links and descriptions from them, store the results (thumbnail + text) for 24 hours, and — when I connect a folder — read that folder and write the organized text files back into it.
          </span>
        </label>
      </div>

      {!consent && (
        <p className="rounded-lg bg-surface-2 p-3 text-center text-sm text-fg-muted">Accept the terms above to start organizing.</p>
      )}

      {/* intake */}
      {consent && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-bold text-fg">Add screenshots</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={onUploadClick} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
                <Upload className="h-4 w-4" /> Upload
              </button>
              <button onClick={pickDeviceFolder} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-primary">
                <FolderOpen className="h-4 w-4" /> {hasDirHandle ? "Re-scan folder" : "Connect folder"}
              </button>
            </div>
            {hasDirHandle && (
              <button onClick={writeBack} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Download className="h-3 w-3" /> write links.txt + notes.txt into my folder
              </button>
            )}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-bold text-fg">Take a screenshot</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={takeScreen} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold hover:border-primary">
                <Camera className="h-3.5 w-3.5" /> Screen / window
              </button>
              <button onClick={takeFullPage} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold hover:border-primary">
                <Camera className="h-3.5 w-3.5" /> Active tab (full page)
              </button>
              <button onClick={takeSelection} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold hover:border-primary">
                <Camera className="h-3.5 w-3.5" /> Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* hidden inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) openDetailsForFiles(f); }} />
      <input ref={dirInputRef} type="file" multiple className="hidden" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) openDetailsForFiles(f); }} />

      {quota && (
        <p className="text-xs text-fg-muted">
          {quota.plan} plan · {Math.max(0, quota.screenshots.limit - quota.screenshots.used)} of {quota.screenshots.limit} screenshots left today · {Math.max(0, quota.recoveries.limit - quota.recoveries.used)} link recoveries left
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      {busy && (
        <p className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> {busy}</p>
      )}
      {toast && <p className="rounded-lg bg-emerald-500/10 p-2 text-center text-sm text-emerald-600 dark:text-emerald-400">{toast}</p>}

      {/* groups view */}
      {session && (
        <div className="space-y-6">
          {[...grouped.entries()].map(([g, items]) => {
            const gRow = session.groups.find((x) => x.name === g);
            return (
              <section key={g} className="rounded-xl border border-border bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  {gRow ? (
                    <input
                      defaultValue={g}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== g && renameGroup(gRow.id, e.target.value)}
                      className="bg-transparent font-bold text-fg outline-none focus:underline"
                    />
                  ) : (
                    <span className="font-bold text-fg">{g}</span>
                  )}
                  <span className="flex items-center gap-3 text-xs text-fg-muted">
                    {items.length} screenshot{items.length === 1 ? "" : "s"}
                    {gRow && (
                      <button onClick={() => deleteGroup(gRow.id)} className="inline-flex items-center gap-1 text-red-500 hover:underline"><Trash2 className="h-3 w-3" /> delete group</button>
                    )}
                  </span>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((it) => (
                    <article key={it.id} className="flex flex-col rounded-lg border border-border bg-surface-2 p-3">
                      {it.thumb && <img src={it.thumb} alt={it.name} className="mb-2 h-32 w-full rounded-md object-cover object-top" />}
                      <p className="flex items-start justify-between gap-2 text-sm font-semibold text-fg">
                        <span className="break-words">{it.name}</span>
                        <span className="flex shrink-0 gap-1">
                          {blobsRef.current.has(it.id) && (
                            <button title="Download this screenshot image" onClick={() => downloadImage(it)} className="text-fg-muted hover:text-primary"><Download className="h-3.5 w-3.5" /></button>
                          )}
                          <button title="Edit name / group / details / link" onClick={() => setModal({ mode: "edit", itemId: it.id, name: it.name, group: groupNameOf(it), details: it.details, link: it.user_link, preview: it.thumb || undefined })} className="text-fg-muted hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                          <button title="Delete screenshot" onClick={() => deleteItem(it.id)} className="text-fg-muted hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        </span>
                      </p>
                      {it.analysis?.key_info && <p className="mt-1 text-xs text-fg-muted">{it.analysis.key_info}</p>}
                      {it.analysis?.why && <p className="mt-1 text-xs italic text-fg-muted">Why: {it.analysis.why}</p>}
                      {(it.user_link || it.recovered_links.length > 0 || it.analysis?.links?.length) && (
                        <ul className="mt-2 space-y-1 text-xs">
                          {it.user_link && (
                            <li className="flex items-start gap-1"><Link2 className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" /><a href={it.user_link} target="_blank" rel="noreferrer" className="break-all text-sky-600 hover:underline dark:text-sky-400">{it.user_link}</a></li>
                          )}
                          {it.recovered_links.map((l, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="shrink-0">{l.verdict === "verified" ? "✅" : l.verdict === "probable" ? "🔎" : "💡"}</span>
                              {l.verdict === "suggestion" ? (
                                <span className="text-fg-muted">Try searching: {l.details || l.url}</span>
                              ) : (
                                <a href={l.url} target="_blank" rel="noreferrer" className="break-all text-sky-600 hover:underline dark:text-sky-400">{l.url}{l.details ? ` — ${l.details}` : ""}</a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {!it.recovered_links.length && !it.user_link && (
                        <button onClick={() => recover(it.id)} className="mt-2 inline-flex w-fit items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-fg hover:border-primary">
                          <RefreshCw className="h-3 w-3" /> Recover links
                        </button>
                      )}
                      {it.analysis?.sensitive && (
                        <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">⚠ May contain sensitive info</p>
                      )}
                      {it.status === "error" && <p className="mt-2 text-xs text-red-500">{it.error ?? "Analysis failed."}</p>}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* exports */}
      {session && (
        <div className="grid gap-3 sm:grid-cols-2">
          {([["links.txt", session.linksText], ["notes.txt", session.notesText]] as const).map(([fname, text]) => (
            <div key={fname} className="rounded-xl border border-border bg-surface p-4">
              <p className="flex items-center justify-between text-sm font-bold text-fg">
                {fname}
                <span className="flex gap-2">
                  <button title="Copy" onClick={() => { navigator.clipboard.writeText(text); flash(`${fname} copied.`); }} className="text-fg-muted hover:text-primary"><Copy className="h-4 w-4" /></button>
                  <button title="Download" onClick={() => download(text, fname)} className="text-fg-muted hover:text-primary"><Download className="h-4 w-4" /></button>
                </span>
              </p>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-fg-muted">{text}</pre>
            </div>
          ))}
        </div>
      )}

      {/* details modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-xl bg-surface p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="font-bold text-fg">{modal.mode === "new" ? "About this screenshot" : "Edit screenshot"}</p>
              <button onClick={() => setModal(null)} className="text-fg-muted hover:text-fg"><X className="h-4 w-4" /></button>
            </div>
            {modal.preview && <img src={modal.preview} alt="" className="mt-3 max-h-48 w-full rounded-lg object-contain" />}
            <label className="mt-3 block text-xs font-semibold text-fg-muted">Name (you can change this)</label>
            <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-primary" />
            <label className="mt-3 block text-xs font-semibold text-fg-muted">Group</label>
            <input
              value={modal.group}
              onChange={(e) => setModal({ ...modal, group: e.target.value })}
              list="zo-groups"
              placeholder="e.g. Work, Receipts, Project ideas…"
              className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-primary"
            />
            <datalist id="zo-groups">
              {(session?.groups ?? []).map((g) => <option key={g.id} value={g.name} />)}
            </datalist>
            <label className="mt-3 block text-xs font-semibold text-fg-muted">Details — why did you take this? (optional)</label>
            <textarea value={modal.details} onChange={(e) => setModal({ ...modal, details: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-primary" />
            <label className="mt-3 block text-xs font-semibold text-fg-muted">Link (if you have one — leave empty and Zotomic AI will try to recover it)</label>
            <input value={modal.link} onChange={(e) => setModal({ ...modal, link: e.target.value })} placeholder="https://…" className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-primary" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-fg">Cancel</button>
              <button
                onClick={modal.mode === "new" ? submitDetails : async () => { const m = modal; setModal(null); await updateItem(m.itemId!, { name: m.name, details: m.details, link: m.link }); }}
                disabled={!consent}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> {modal.mode === "new" ? "Organize it" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
