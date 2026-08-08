"use client";

// Scroll-reveal helper: sets `data-inview` once when the element crosses the
// threshold. Disconnects the observer on unmount (ref receives null).
import { useCallback, useRef } from "react";

export function useReveal(threshold = 0.2): (node: HTMLElement | null) => void {
  const observerRef = useRef<IntersectionObserver | null>(null);

  return useCallback(
    (node: HTMLElement | null) => {
      // Cleanup previous observer on unmount or ref change
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!node) return;
      if (typeof IntersectionObserver === "undefined") {
        node.dataset.inview = "";
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              (entry.target as HTMLElement).dataset.inview = "";
              observer.unobserve(entry.target);
            }
          }
        },
        { threshold },
      );
      observerRef.current = observer;
      observer.observe(node);
    },
    [threshold],
  );
}
