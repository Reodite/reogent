"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

export type WorkspaceHost = "chat" | "tools" | "unity" | "answer-canvas" | "settings";

interface WorkspaceHostValue {
  host: WorkspaceHost;
  navigation: ReactNode;
  titlebarOutlet: HTMLElement | null;
}

const DEFAULT_HOST: WorkspaceHostValue = {
  host: "tools",
  navigation: null,
  titlebarOutlet: null,
};

const WorkspaceHostContext = createContext<WorkspaceHostValue>(DEFAULT_HOST);

/** Supplies the shell location, header navigation, and Answer Canvas action outlet. */
export function WorkspaceHostProvider({
  host,
  navigation = null,
  titlebarOutlet = null,
  children,
}: {
  host: WorkspaceHost;
  navigation?: ReactNode;
  titlebarOutlet?: HTMLElement | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ host, navigation, titlebarOutlet }), [host, navigation, titlebarOutlet]);

  return <WorkspaceHostContext.Provider value={value}>{children}</WorkspaceHostContext.Provider>;
}

/** Returns the workspace host supplied by the app shell or Answer Canvas. */
export function useWorkspaceHost(): WorkspaceHostValue {
  return useContext(WorkspaceHostContext);
}
