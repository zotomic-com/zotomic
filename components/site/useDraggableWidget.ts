"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Position {
  x: number;
  y: number;
}

const DRAG_THRESHOLD = 4;

/**
 * Pointer-drag reposition for a floating launcher. Returns a translate offset
 * (apply as `transform: translate(x,y)` on top of the button's normal fixed
 * corner position) plus the handlers to wire onto the draggable element.
 * Remembers position per browser tab (sessionStorage) so a reload doesn't
 * reset it, but a fresh tab starts back at the default corner.
 */
export function useDraggableWidget(storageKey: string) {
  const [pos, setPos] = useState<Position>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setPos(JSON.parse(raw));
    } catch {
      /* private mode / quota */
    }
  }, [storageKey]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) dragRef.current.moved = true;
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }, []);

  /** Returns true if this pointer-up ended an actual drag (vs. a plain tap) — use to suppress the click. */
  const onPointerUp = useCallback(() => {
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    setDragging(false);
    if (moved) {
      setPos((p) => {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(p));
        } catch {
          /* ignore */
        }
        return p;
      });
    }
    return moved;
  }, [storageKey]);

  return { pos, dragging, onPointerDown, onPointerMove, onPointerUp };
}
