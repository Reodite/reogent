"use client";

import { SHELL_MODE_STORAGE_KEY, type ShellMode } from "@/src/lib/shell-mode";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Tracks routed shell modes without changing the current mode on Settings.
 * `setMode` persists explicit navigation; the dataset mirrors routed state for
 * paint parity with the bootstrap script in `app/layout.tsx`.
 */
export function useShellMode(initial: ShellMode = "ai"): [ShellMode, (mode: ShellMode) => void] {
  const [mode, setModeState] = useState<ShellMode>(initial);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/settings") return;
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
