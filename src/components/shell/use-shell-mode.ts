"use client";

import { parseShellMode, SHELL_MODE_STORAGE_KEY, type ShellMode } from "@/src/lib/shell-mode";
import { usePathname } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type ShellModePaths = { committedPathname: string; displayPathname: string };

/** Returns the routed shell area, leaving utility paths to the remembered mode. */
export function shellModeForPath(pathname: string): ShellMode | null {
  if (pathname.startsWith("/tools")) return "tools";
  if (pathname.startsWith("/pulse")) return "unity";
  if (pathname.startsWith("/chat")) return "ai";
  return null;
}

/** Tracks the committed mode while rendering navigation intent synchronously. */
export function useShellMode(
  initial: ShellMode = "ai",
  paths?: ShellModePaths,
): [ShellMode, (mode: ShellMode) => void] {
  const currentPathname = usePathname() ?? "";
  const committedPathname = paths?.committedPathname ?? currentPathname;
  const displayPathname = paths?.displayPathname ?? committedPathname;
  const [rememberedMode, setRememberedMode] = useState<ShellMode>(initial);
  const hydrateStoredModeOnSettings = useRef(committedPathname === "/settings" && initial === "ai");
  const settingsHydrated = useRef(false);
  const routedDisplayMode = shellModeForPath(displayPathname);
  const displayMode = routedDisplayMode ?? rememberedMode;

  useLayoutEffect(() => {
    const committedMode = shellModeForPath(committedPathname);
    if (committedMode) {
      setRememberedMode(committedMode);
      return;
    }
    if (committedPathname !== "/settings" || !hydrateStoredModeOnSettings.current || settingsHydrated.current) return;
    settingsHydrated.current = true;
    try {
      setRememberedMode(parseShellMode(window.localStorage.getItem(SHELL_MODE_STORAGE_KEY)));
    } catch {
      /* localStorage unavailable */
    }
  }, [committedPathname]);

  useLayoutEffect(() => {
    document.documentElement.dataset.shellMode = displayMode;
  }, [displayMode]);

  const setMode = useCallback((next: ShellMode) => {
    setRememberedMode(next);
    try {
      window.localStorage.setItem(SHELL_MODE_STORAGE_KEY, next);
      document.documentElement.dataset.shellMode = next;
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  return [displayMode, setMode];
}
