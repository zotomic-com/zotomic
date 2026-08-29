"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/** Downscale + re-encode in the browser before upload (max 1600px, JPEG q0.82). */
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82),
  );
}

export function ImageUploader({
  value,
  onChange,
  max = 6,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList) => {
    setBusy(true);
    try {
      const sigRes = await fetch("/api/app/media/sign", { method: "POST" });
      if (!sigRes.ok) {
        toast(sigRes.status === 503 ? "Image uploads aren't configured yet." : "Upload failed", "error");
        return;
      }
      const sig = await sigRes.json();
      const added: string[] = [];

      for (const file of Array.from(files).slice(0, max - value.length)) {
        if (file.size > 15 * 1024 * 1024) {
          toast(`${file.name} is too large (max 15MB)`, "error");
          continue;
        }
        const blob = await compress(file);
        const form = new FormData();
        form.append("file", blob);
        form.append("api_key", sig.apiKey);
        form.append("timestamp", String(sig.timestamp));
        form.append("folder", sig.folder);
        form.append("signature", sig.signature);

        const up = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
          method: "POST",
          body: form,
        });
        const data = await up.json();
        if (!data.secure_url) {
          toast("Cloudinary rejected the upload", "error");
          continue;
        }
        await fetch("/api/app/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_id: data.public_id,
            url: data.secure_url,
            width: data.width,
            height: data.height,
            bytes: data.bytes,
            format: data.format,
          }),
        });
        added.push(data.secure_url);
      }
      if (added.length) onChange([...value, ...added]);
    } catch {
      toast("Upload failed", "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={url} className="relative h-20 w-20 overflow-hidden rounded-sm border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border-strong text-fg-subtle hover:border-primary hover:text-primary"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            <span className="text-[10px]">Upload</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
    </div>
  );
}
