"use client";

import { SHELL_MODE_STORAGE_KEY, type ShellMode } from "@/src/lib/shell-mode";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * The AI/Tools shell mode, derived from the current URL pathname and persisted
 * to localStorage. `/tools/*` → "tools", anything else → "ai". The pathname
 * effect keeps state in lockstep with navigation (including deep links and
 * back/forward); `setMode` writes the local preference and lets the caller
 * push the URL (see `mode-toggle.tsx`). Dataset mirror is for SSR/paint parity
 * with the bootstrap script in `app/layout.tsx`.
 */
export function useShellMode(initial: ShellMode = "ai"): [ShellMode, (mode: ShellMode) => void] {
  const [mode, setModeState] = useState<ShellMode>(initial);
  const pathname = usePathname();

  useEffect(() => {
    const next: ShellMode = pathname?.startsWith("/tools") ? "tools" : "ai";
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
