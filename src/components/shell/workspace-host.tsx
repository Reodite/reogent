"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

export type WorkspaceHost = "tools" | "unity" | "answer-canvas" | "settings";

interface WorkspaceHostValue {
  host: WorkspaceHost;
  menuClearance: boolean;
  titlebarOutlet: HTMLElement | null;
}

const DEFAULT_HOST: WorkspaceHostValue = {
  host: "tools",
  menuClearance: true,
  titlebarOutlet: null,
};

const WorkspaceHostContext = createContext<WorkspaceHostValue>(DEFAULT_HOST);

/** Supplies the shell location and titlebar outlet for a workspace page. */
export function WorkspaceHostProvider({
  host,
  menuClearance,
  titlebarOutlet = null,
  children,
}: Omit<WorkspaceHostValue, "titlebarOutlet"> & { titlebarOutlet?: HTMLElement | null; children: ReactNode }) {
  const value = useMemo(() => ({ host, menuClearance, titlebarOutlet }), [host, menuClearance, titlebarOutlet]);

  return <WorkspaceHostContext.Provider value={value}>{children}</WorkspaceHostContext.Provider>;
}

/** Returns the workspace host supplied by the app shell or Answer Canvas. */
export function useWorkspaceHost(): WorkspaceHostValue {
  return useContext(WorkspaceHostContext);
}
