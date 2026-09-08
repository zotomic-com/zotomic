"use client";

import { useState } from "react";
import { cldUrl } from "@/lib/cloudinary";

/** PDP image gallery — vertical thumb rail on desktop, swipe + dots on mobile. */
export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const imgs = images.length ? images : [];
  const [active, setActive] = useState(0);
  const main = imgs[active] ?? imgs[0] ?? null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse sm:gap-4">
      <div className="aspect-square flex-1 overflow-hidden rounded-[var(--sf-radius-lg)] bg-[var(--sf-card)]">
        {main ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cldUrl(main, 1000)}
            alt={name}
            width={1000}
            height={1000}
            className="h-full w-full object-cover"
            decoding="async"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--sf-muted)]">No image</div>
        )}
      </div>

      {imgs.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto sm:flex-col sm:overflow-y-auto">
          {imgs.slice(0, 6).map((u, i) => (
            <button
              key={u + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-[var(--sf-radius)] border-2 transition-colors ${
                active === i ? "border-[var(--sf-accent)]" : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cldUrl(u, 120)} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
