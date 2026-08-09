"use client";

// Shared state for the /chat shell: the walking-route highlight the map renders,
// panel open/collapsed state, and the session list (sidebar refreshes after each
// completed exchange).
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useApi } from "@/src/components/providers";
import type { SessionSummary } from "@/src/lib/api-types";
import type { MapHighlight, WalkingHighlight } from "@/src/lib/walking";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type { MapHighlight, WalkingHighlight };

interface ChatShellState {
  highlight: MapHighlight | null;
  /** Bumped when the user asks to re-focus the route (e.g. "Show on map"). */
  focusNonce: number;
  setHighlight: (highlight: MapHighlight | null) => void;
  /** Re-focus the current highlight and reveal the map. */
  showOnMap: () => void;

  mapOpen: boolean;
  setMapOpen: (open: boolean) => void;
  mobileMapOpen: boolean;
  setMobileMapOpen: (open: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  sessions: SessionSummary[];
  sessionsLoading: boolean;
  sessionsError: string | null;
  refreshSessions: () => void;
}

const ChatShellContext = createContext<ChatShellState | null>(null);

export function useChatShell(): ChatShellState {
  const value = useContext(ChatShellContext);
  if (!value) throw new Error("useChatShell must be used within <ChatShellProvider>");
  return value;
}

export function ChatShellProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const auth = useAppAuth();

  const [highlight, setHighlightState] = useState<MapHighlight | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [mapOpen, setMapOpen] = useState(true);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const doRefresh = useCallback(() => {
    const seq = ++loadSeq.current;
    setSessionsError(null);
    api
      .listSessions()
      .then((list) => {
        if (loadSeq.current !== seq || !mountedRef.current) return;
        setSessions(list);
        setSessionsLoading(false);
      })
      .catch((error: unknown) => {
        if (loadSeq.current !== seq || !mountedRef.current) return;
        setSessionsLoading(false);
        setSessionsError(error instanceof Error ? error.message : "Couldn't load sessions");
      });
  }, [api]);

  const refreshSessions = useCallback(() => {
    // Debounce: at most one refresh per 2s to avoid spamming during rapid exchanges
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(doRefresh, 2000);
  }, [doRefresh]);

  // Initial load is immediate, not debounced
  useEffect(() => {
    if (auth.status === "signedIn") doRefresh();
  }, [auth.status, doRefresh]);

  const setHighlight = useCallback((next: MapHighlight | null) => {
    setHighlightState(next);
    if (next) {
      setFocusNonce((n) => n + 1);
      // Auto-open mobile bottom sheet when a map highlight arrives
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
        setMobileMapOpen(true);
      }
    }
  }, []);

  const showOnMap = useCallback(() => {
    setFocusNonce((n) => n + 1);
    setMapOpen(true);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) setMobileMapOpen(true);
  }, []);

  const value = useMemo<ChatShellState>(
    () => ({
      highlight,
      focusNonce,
      setHighlight,
      showOnMap,
      mapOpen,
      setMapOpen,
      mobileMapOpen,
      setMobileMapOpen,
      sidebarOpen,
      setSidebarOpen,
      sessions,
      sessionsLoading,
      sessionsError,
      refreshSessions,
    }),
    [
      highlight,
      focusNonce,
      setHighlight,
      showOnMap,
      mapOpen,
      mobileMapOpen,
      sidebarOpen,
      sessions,
      sessionsLoading,
      sessionsError,
      refreshSessions,
    ],
  );

  return <ChatShellContext.Provider value={value}>{children}</ChatShellContext.Provider>;
}
