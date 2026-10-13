"use client";

import { animate } from "motion/mini";
import { usePresence, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, type RefObject } from "react";

type OverlayKind = "popover" | "dialog" | "fade";

/** Animates an overlay without delaying focus, and releases exiting presence after its visual teardown. */
export function useOverlayPresence(ref: RefObject<HTMLElement | null>, kind: OverlayKind, ready = true): boolean {
  const [present, safeToRemove] = usePresence();
  const reduce = useReducedMotion();
  const entered = useRef(false);
  const removeRef = useRef(safeToRemove);
  removeRef.current = safeToRemove;

  useLayoutEffect(() => {
    let cancelled = false;
    const complete = () => {
      queueMicrotask(() => {
        if (!cancelled && !present) removeRef.current?.();
      });
    };
    const node = ref.current;
    if (!ready || !node || (!present && !entered.current)) {
      if (!present) complete();
      return () => {
        cancelled = true;
      };
    }
    const offset = kind === "dialog" ? 12 : node.dataset.overlaySide === "top" ? 4 : -4;
    const hiddenTransform = `translateY(${offset}px) scale(0.985)`;
    if (reduce || typeof node.animate !== "function") {
      node.style.opacity = "1";
      if (kind !== "fade") node.style.transform = "none";
      entered.current = true;
      if (!present) complete();
      return () => {
        cancelled = true;
      };
    }
    if (!entered.current && present) {
      node.style.opacity = "0";
      if (kind !== "fade") node.style.transform = hiddenTransform;
    }
    entered.current = true;
    const animation = animate(
      [node],
      {
        opacity: present ? 1 : 0,
        ...(kind === "fade" ? {} : { transform: present ? "none" : hiddenTransform }),
      },
      { duration: present ? 0.22 : 0.14, ease: [0.16, 1, 0.3, 1] },
    );
    animation.then(complete);
    return () => {
      cancelled = true;
      animation.stop();
    };
  }, [kind, present, ready, reduce, ref]);

  return present;
}
