"use client";

import { parseShellMode, SHELL_MODE_STORAGE_KEY, utilityPageForPath, type ShellMode } from "@/src/lib/shell-mode";
import { usePathname } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type ShellModePaths = { committedPathname: string; displayPathname: string };

/** Returns the routed shell area, leaving utility paths to the remembered mode. */
export function shellModeForPath(pathname: string): ShellMode | null {
  if (pathname === "/app/tools" || pathname.startsWith("/app/tools/")) return "tools";
  if (pathname === "/app/pulse" || pathname.startsWith("/app/pulse/")) return "unity";
  if (pathname === "/app" || pathname.startsWith("/app/chat/")) return "ai";
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
  const hydrateStoredModeOnUtility = useRef(utilityPageForPath(committedPathname) !== null && initial === "ai");
  const utilityHydrated = useRef(false);
  const routedDisplayMode = shellModeForPath(displayPathname);
  const displayMode = routedDisplayMode ?? rememberedMode;

  useLayoutEffect(() => {
    const committedMode = shellModeForPath(committedPathname);
    if (committedMode) {
      setRememberedMode(committedMode);
      return;
    }
    if (!utilityPageForPath(committedPathname) || !hydrateStoredModeOnUtility.current || utilityHydrated.current)
      return;
    utilityHydrated.current = true;
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
