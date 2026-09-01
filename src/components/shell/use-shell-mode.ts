"use client";

import { parseShellMode, SHELL_MODE_STORAGE_KEY, type ShellMode } from "@/src/lib/shell-mode";
import { usePathname } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Tracks routed shell modes without changing the current mode on Settings.
 * `setMode` persists explicit navigation; the dataset mirrors routed state for
 * paint parity with the bootstrap script in `app/layout.tsx`.
 */
export function useShellMode(initial: ShellMode = "ai"): [ShellMode, (mode: ShellMode) => void] {
  const [mode, setModeState] = useState<ShellMode>(initial);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pathname = usePathname();
  const hydrateStoredModeOnSettings = useRef(pathname === "/settings" && initial === "ai");
  const settingsHydrated = useRef(false);

  useLayoutEffect(() => {
    if (pathname === "/settings") {
      let settingsMode = modeRef.current;
      if (hydrateStoredModeOnSettings.current && !settingsHydrated.current) {
        settingsHydrated.current = true;
        try {
          settingsMode = parseShellMode(window.localStorage.getItem(SHELL_MODE_STORAGE_KEY));
          setModeState(settingsMode);
        } catch {
          /* localStorage unavailable */
        }
      }
      document.documentElement.dataset.shellMode = settingsMode;
      return;
    }
    const next: ShellMode = pathname?.startsWith("/tools") ? "tools" : pathname?.startsWith("/pulse") ? "unity" : "ai";
    setModeState(next);
    // Dataset mirrors the URL so pre-paint chrome matches the active route.
    // localStorage stays as the user preference (written only by `setMode`).
    try {
      document.documentElement.dataset.shellMode = next;
    } catch {
      /* dataset unavailable */
    }
  }, [pathname]);

  const setMode = useCallback((next: ShellMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(SHELL_MODE_STORAGE_KEY, next);
      document.documentElement.dataset.shellMode = next;
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  return [mode, setMode];
}
