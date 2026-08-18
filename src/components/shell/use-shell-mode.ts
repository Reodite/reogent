"use client";

import { parseShellMode, SHELL_MODE_STORAGE_KEY, type ShellMode } from "@/src/lib/shell-mode";
import { useCallback, useEffect, useState } from "react";

/**
 * The AI/Tools shell mode, persisted to localStorage and mirrored to
 * `documentElement.dataset.shellMode`. The layout bootstrap sets that dataset
 * attribute pre-paint so the chrome matches before React hydrates; SSR and the
 * first client render stay "ai", and a post-mount effect applies the stored
 * mode, avoiding a hydration mismatch.
 */
export function useShellMode(): [ShellMode, (mode: ShellMode) => void] {
  const [mode, setModeState] = useState<ShellMode>("ai");

  useEffect(() => {
    try {
      setModeState(parseShellMode(window.localStorage.getItem(SHELL_MODE_STORAGE_KEY)));
    } catch {
      /* localStorage unavailable */
    }
  }, []);

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
