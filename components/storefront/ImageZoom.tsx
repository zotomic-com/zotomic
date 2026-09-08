"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cldUrl } from "@/lib/cloudinary";

/** Full-screen image viewer. Double-tap / double-click to zoom, drag to pan,
 *  swipe down (when not zoomed) to close. Smooth CSS transitions. */
export function ImageZoom({
  images,
  index,
  onClose,
  alt,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  alt: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [i, setI] = useState(index);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastTap = useRef(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const [swipeY, setSwipeY] = useState(0);
  const [swipeX, setSwipeX] = useState(0);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(images.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [images.length, onClose]);
  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [i]);

  if (!mounted) return null;

  const toggleZoom = () => {
    if (scale > 1) {
      setScale(1);
      setPos({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale > 1) drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    else gesture.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) {
      setPos({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
      return;
    }
    if (!gesture.current) return;
    const dx = e.clientX - gesture.current.x;
    const dy = e.clientY - gesture.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setSwipeX(dx);
      setSwipeY(0);
    } else if (dy > 0) {
      setSwipeY(dy);
      setSwipeX(0);
    }
  };
  const onPointerUp = () => {
    if (gesture.current) {
      if (Math.abs(swipeX) > 60 && images.length > 1) {
        setI((v) => (swipeX < 0 ? Math.min(images.length - 1, v + 1) : Math.max(0, v - 1)));
      } else if (swipeY > 110) {
        onClose();
      }
    }
    drag.current = null;
    gesture.current = null;
    setSwipeY(0);
    setSwipeX(0);
  };
  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) toggleZoom();
    lastTap.current = now;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex touch-none select-none items-center justify-center bg-black"
      style={{ opacity: swipeY ? Math.max(0.3, 1 - swipeY / 400) : 1 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 rounded-full bg-white/15 p-2 text-white backdrop-blur"
      >
        <X className="h-5 w-5" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cldUrl(images[i], 1400)}
        alt={alt}
        onClick={onTap}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{
          transform: `translate(${pos.x + swipeX * 0.4}px, ${pos.y + swipeY}px) scale(${scale})`,
          transition: drag.current || gesture.current ? "none" : "transform .28s ease",
          cursor: scale > 1 ? "grab" : "zoom-in",
        }}
      />

      {images.length > 1 && (
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-1.5">
          {images.map((_, n) => (
            <button
              key={n}
              onClick={() => setI(n)}
              aria-label={`Image ${n + 1}`}
              className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
