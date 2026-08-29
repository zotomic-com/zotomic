"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { ImageUploader } from "@/components/app/ImageUploader";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

interface Asset {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_at: string;
}

export function MediaClient() {
  const { toast } = useToast();
  const [assets, setAssets] = useState<Asset[] | null>(null);

  const load = () =>
    fetch("/api/app/media")
      .then((r) => r.json())
      .then((d) => setAssets(d.assets ?? []));

  useEffect(() => {
    load();
  }, []);

  const del = async (id: string) => {
    const res = await fetch(`/api/app/media?id=${id}`, { method: "DELETE" });
    const d = await res.json();
    if (res.ok) {
      toast("Deleted", "success");
      load();
    } else {
      toast(d.error ?? "Could not delete", "error");
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-bold text-fg">Upload</p>
        <ImageUploader value={[]} onChange={() => load()} max={20} />
        <p className="mt-2 text-xs text-fg-subtle">
          Images are compressed in your browser, then stored on Cloudinary and delivered optimized.
        </p>
      </div>

      {assets === null ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : assets.length === 0 ? (
        <EmptyState title="No media yet" description="Upload product images above or from a product." />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {assets.map((a) => (
            <div key={a.id} className="group relative overflow-hidden rounded-sm border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="" className="aspect-square w-full object-cover" />
              <button
                onClick={() => del(a.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
