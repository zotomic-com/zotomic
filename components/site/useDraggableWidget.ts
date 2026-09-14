"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Position {
  x: number;
  y: number;
}

const DRAG_THRESHOLD = 4;
/** Minimum gap (px) kept between the widget and the viewport edge — never flush, never off-screen. */
const EDGE_MARGIN = 8;

/**
 * Clamp a translate offset so the element (whose un-translated rect is
 * `base`) stays fully inside the current viewport, with a small edge margin.
 */
function clamp(x: number, y: number, base: DOMRect): Position {
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - base.width - EDGE_MARGIN) - base.left;
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - base.height - EDGE_MARGIN) - base.top;
  const minX = EDGE_MARGIN - base.left;
  const minY = EDGE_MARGIN - base.top;
  return {
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  };
}

/**
 * Pointer-drag reposition for a floating launcher. Returns a translate offset
 * (apply as `transform: translate(x,y)` on top of the button's normal fixed
 * corner position) plus the handlers to wire onto the draggable element.
 * Remembers position per browser tab (sessionStorage) so a reload doesn't
 * reset it, but a fresh tab starts back at the default corner. Position is
 * always clamped to stay fully inside the viewport — on drag, on mount
 * (a saved position from a wider viewport/device), and on window resize —
 * so the widget can never be dragged out of reach.
 */
export function useDraggableWidget(storageKey: string) {
  const [pos, setPos] = useState<Position>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean; base: DOMRect } | null>(
    null,
  );

  const persist = useCallback(
    (p: Position) => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(p));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const reclamp = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    setPos((p) => {
      const rect = el.getBoundingClientRect();
      const base = new DOMRect(rect.left - p.x, rect.top - p.y, rect.width, rect.height);
      const next = clamp(p.x, p.y, base);
      if (next.x !== p.x || next.y !== p.y) persist(next);
      return next;
    });
  }, [persist]);

  const setRef = useCallback((el: HTMLElement | null) => {
    elRef.current = el;
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setPos(JSON.parse(raw));
    } catch {
      /* private mode / quota */
    }
  }, [storageKey]);

  // Re-clamp whenever the restored/updated position changes and whenever the
  // viewport resizes, so a position saved on a wider screen/device can never
  // leave the widget stranded outside a smaller one.
  useEffect(() => {
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [pos.x, pos.y, reclamp]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const base = (e.currentTarget as HTMLElement).getBoundingClientRect();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
        moved: false,
        base: new DOMRect(base.left - pos.x, base.top - pos.y, base.width, base.height),
      };
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
    const raw = { x: dragRef.current.origX + dx, y: dragRef.current.origY + dy };
    setPos(clamp(raw.x, raw.y, dragRef.current.base));
  }, []);

  /** Returns true if this pointer-up ended an actual drag (vs. a plain tap) — use to suppress the click. */
  const onPointerUp = useCallback(() => {
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    setDragging(false);
    if (moved) {
      setPos((p) => {
        persist(p);
        return p;
      });
    }
    return moved;
  }, [persist]);

  return { pos, dragging, ref: setRef, onPointerDown, onPointerMove, onPointerUp };
}
