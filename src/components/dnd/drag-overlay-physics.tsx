"use client";

import type { DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { motion, useReducedMotion, useSpring, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Cursor-relative anchor and source width used by the shared drag overlay. */
export type DragOverlayAnchor = {
  x: number;
  y: number;
  width: number;
};

type DragOverlayFrameProps = {
  anchor: DragOverlayAnchor;
  children: ReactNode;
  reducedMotion: boolean | null;
  rotate: MotionValue<number>;
};

type DragOverlayPhysicsOptions = {
  resolveSourceElement?: (event: DragStartEvent) => HTMLElement | null;
};

/** Tracks cursor anchoring, velocity tilt, and reduced-motion state for a drag overlay. */
export function useDragOverlayPhysics({ resolveSourceElement }: DragOverlayPhysicsOptions = {}) {
  const [anchor, setAnchor] = useState<DragOverlayAnchor>({ x: 0, y: 0, width: 0 });
  const reducedMotion = useReducedMotion();
  const rotate = useSpring(0, { stiffness: 260, damping: 14, mass: 0.7 });
  const sample = useRef({ x: 0, t: 0 });
  const idleTimer = useRef<number | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const steadyAnchor = useRef<{ x: number; y: number } | null>(null);

  // PointerSensor retains the original pointerdown event, so track the live
  // pointer position that crosses its activation threshold.
  useEffect(() => {
    function trackPointer(event: PointerEvent) {
      pointer.current = { x: event.clientX, y: event.clientY };
    }
    window.addEventListener("pointerdown", trackPointer, true);
    window.addEventListener("pointermove", trackPointer, true);
    return () => {
      window.removeEventListener("pointerdown", trackPointer, true);
      window.removeEventListener("pointermove", trackPointer, true);
    };
  }, []);

  useEffect(
    () => () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    },
    [],
  );

  function settle() {
    rotate.set(0);
  }

  function start(event: DragStartEvent) {
    sample.current = { x: 0, t: performance.now() };
    settle();
    const activator = event.activatorEvent;
    const sourceElement = resolveSourceElement?.(event);
    // The initial rect can be absent at activation, so preserve the source
    // element and translated rect as anchor fallbacks.
    const rect =
      event.active.rect.current.initial ??
      sourceElement?.getBoundingClientRect() ??
      event.active.rect.current.translated;
    const originX = "clientX" in activator && typeof activator.clientX === "number" ? activator.clientX : null;
    const originY = "clientY" in activator && typeof activator.clientY === "number" ? activator.clientY : null;
    const clientX = pointer.current?.x ?? originX;
    const clientY = pointer.current?.y ?? originY;
    if (rect && clientX !== null && clientY !== null) {
      setAnchor({
        x: clientX - rect.left - rect.width / 2,
        y: clientY - rect.top,
        width: rect.width,
      });
      steadyAnchor.current =
        originX !== null && originY !== null
          ? { x: originX - rect.left - rect.width / 2, y: originY - rect.top }
          : null;
    } else {
      setAnchor({ x: 0, y: 0, width: rect?.width ?? 0 });
    }
  }

  function move(event: DragMoveEvent) {
    if (steadyAnchor.current && (event.delta.x !== 0 || event.delta.y !== 0)) {
      const steady = steadyAnchor.current;
      steadyAnchor.current = null;
      setAnchor((current) => ({ ...current, x: steady.x, y: steady.y }));
    }
    if (reducedMotion) return;
    const now = performance.now();
    const dt = Math.max(1, now - sample.current.t) / 1000;
    const vx = (event.delta.x - sample.current.x) / dt;
    sample.current = { x: event.delta.x, t: now };
    rotate.set(Math.max(-12, Math.min(12, vx * 0.01)));
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(settle, 120);
  }

  return { anchor, move, reducedMotion, rotate, settle, start };
}

/** Applies shared anchored spring and tilt motion to drag-overlay content. */
export function DragOverlayFrame({ anchor, children, reducedMotion, rotate }: DragOverlayFrameProps) {
  return (
    <motion.div
      data-drag-anchor
      initial={reducedMotion ? false : { x: 0, y: 0 }}
      animate={{ x: anchor.x, y: anchor.y }}
      transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34, mass: 0.55 }}
    >
      <motion.div style={reducedMotion ? undefined : { rotate, transformOrigin: "50% 0%" }}>{children}</motion.div>
    </motion.div>
  );
}
