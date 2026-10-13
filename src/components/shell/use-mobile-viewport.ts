"use client";

import { useCallback } from "react";

/** Sizes and positions phone shells and fixed overlays within the unzoomed visual viewport. */
export function useMobileViewport() {
  return useCallback((node: HTMLDivElement | null) => {
    const viewport = window.visualViewport;
    if (!node || !viewport) return;
    const phone = window.matchMedia("(max-width: 639px)");
    const clear = () => {
      for (const property of ["height", "--app-viewport-height", "--app-viewport-top", "--app-viewport-bottom"]) {
        node.style.removeProperty(property);
      }
    };
    const resize = () => {
      if (phone.matches && viewport.scale === 1 && viewport.height > 0) {
        node.style.height = `${viewport.height}px`;
        node.style.setProperty("--app-viewport-height", `${viewport.height}px`);
        node.style.setProperty("--app-viewport-top", `${viewport.offsetTop}px`);
        node.style.setProperty(
          "--app-viewport-bottom",
          `${Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height)}px`,
        );
      } else clear();
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    phone.addEventListener("change", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
      phone.removeEventListener("change", resize);
      clear();
    };
  }, []);
}
