"use client";

// Shared state for the /chat shell: which pane holds the visual slot, the walking
// route the map renders, the mobile bottom sheet, and the session list.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useApi } from "@/src/components/providers";
import type { PaneId, PaneState } from "@/src/components/shell/pane-registry";
import type { SessionSummary } from "@/src/lib/api-types";
import type { MapHighlight } from "@/src/lib/walking";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type { MapHighlight };

export type ActiveChannel = { id: PaneId; state: PaneState } | null;
export type PreviousUserChannel = { id: PaneId; state: PaneState } | null;

export interface ChatShellState {
  activeChannel: ActiveChannel;
  previousUserChannel: PreviousUserChannel;
  /** Sets the active pane. Switching to `map` from a user tool captures the prior channel for the "Back to" pill. `null` collapses to the rail. */
  setActiveChannel: (id: PaneId | null, state?: PaneState) => void;
  setPreviousUserChannel: (channel: PreviousUserChannel) => void;

  // Read-only views of the map pane's state.
  highlight: MapHighlight | null;
  mapOpen: boolean;
  focusNonce: number;
  /** Emits a map highlight: opens the map pane with the payload, re-focuses the route, and opens the mobile sheet on small viewports. */
  showOnMap: (highlight: MapHighlight) => void;

  mobileMapOpen: boolean;
  setMobileMapOpen: (open: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  newChatNonce: number;
  startNewChat: () => void;

  sessions: SessionSummary[];
  sessionsLoading: boolean;
  sessionsError: string | null;
  refreshSessions: () => void;
  addOptimisticSession: (sessionId: string, title: string) => void;
  renameSessionLocally: (sessionId: string, title: string) => void;
  removeSessionLocally: (sessionId: string) => void;
}

const ChatShellContext = createContext<ChatShellState | null>(null);

export function useChatShell(): ChatShellState {
  const value = useContext(ChatShellContext);
  if (!value) throw new Error("useChatShell must be used within <ChatShellProvider>");
  return value;
}

const PREVIOUS_USER_CHANNEL_KEY = "reogent.pane.previousUserChannel";

function writePreviousUserChannel(channel: PreviousUserChannel): void {
  if (typeof window === "undefined") return;
  try {
    if (channel) window.sessionStorage.setItem(PREVIOUS_USER_CHANNEL_KEY, JSON.stringify(channel));
    else window.sessionStorage.removeItem(PREVIOUS_USER_CHANNEL_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
}

function readPreviousUserChannel(): PreviousUserChannel {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREVIOUS_USER_CHANNEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id: string; state: PaneState };
    return { id: parsed.id as PaneId, state: parsed.state };
  } catch {
    return null;
  }
}

export function ChatShellProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const auth = useAppAuth();

  const [activeChannel, setActiveChannelState] = useState<ActiveChannel>(null);
  // Latest-value ref so setActiveChannel can read the current channel without
  // depending on activeChannel in its callback deps — keeps the callback stable
  // (same pattern as authRef in ApiProvider). ChatPanel's session-load effect
  // lists setActiveChannel in its deps; if it churned on every open, the effect
  // would re-run and reset activeChannel back to null, closing the pane.
  const activeChannelRef = useRef<ActiveChannel>(null);
  activeChannelRef.current = activeChannel;
  const [previousUserChannel, setPreviousUserChannelState] = useState<PreviousUserChannel>(readPreviousUserChannel);
  const [focusNonce, setFocusNonce] = useState(0);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newChatNonce, setNewChatNonce] = useState(0);

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

  useEffect(() => {
    if (auth.status === "signedIn") doRefresh();
  }, [auth.status, doRefresh]);

  const setActiveChannel = useCallback((id: PaneId | null, state: PaneState = {}) => {
    const prev = activeChannelRef.current;
    if (id === "map" && prev && prev.id !== "map") {
      const captured: PreviousUserChannel = { id: prev.id, state: prev.state };
      setPreviousUserChannelState(captured);
      writePreviousUserChannel(captured);
    } else if (id && id !== "map") {
      setPreviousUserChannelState(null);
      writePreviousUserChannel(null);
    }
    setActiveChannelState(id ? { id, state } : null);
  }, []);

  const setPreviousUserChannel = useCallback((channel: PreviousUserChannel) => {
    setPreviousUserChannelState(channel);
    writePreviousUserChannel(channel);
  }, []);

  const showOnMap = useCallback(
    (highlight: MapHighlight) => {
      setActiveChannel("map", { highlight });
      setFocusNonce((n) => n + 1);
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
        setMobileMapOpen(true);
      }
    },
    [setActiveChannel],
  );

  const addOptimisticSession = useCallback((sessionId: string, title: string) => {
    setSessions((prev) => {
      if (prev.some((s) => s.session_id === sessionId)) return prev;
      return [{ session_id: sessionId, title, updatedAt: new Date().toISOString() }, ...prev];
    });
  }, []);

  const renameSessionLocally = useCallback((sessionId: string, title: string) => {
    setSessions((prev) => prev.map((s) => (s.session_id === sessionId ? { ...s, title } : s)));
  }, []);

  const removeSessionLocally = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
  }, []);

  const startNewChat = useCallback(() => {
    setNewChatNonce((n) => n + 1);
  }, []);

  const highlight: MapHighlight | null =
    activeChannel?.id === "map" ? ((activeChannel.state.highlight as MapHighlight | undefined) ?? null) : null;
  const mapOpen = activeChannel?.id === "map";

  const value = useMemo<ChatShellState>(
    () => ({
      activeChannel,
      previousUserChannel,
      setActiveChannel,
      setPreviousUserChannel,
      highlight,
      mapOpen,
      focusNonce,
      showOnMap,
      mobileMapOpen,
      setMobileMapOpen,
      sidebarOpen,
      setSidebarOpen,
      newChatNonce,
      startNewChat,
      sessions,
      sessionsLoading,
      sessionsError,
      refreshSessions,
      addOptimisticSession,
      renameSessionLocally,
      removeSessionLocally,
    }),
    [
      activeChannel,
      previousUserChannel,
      setActiveChannel,
      setPreviousUserChannel,
      highlight,
      mapOpen,
      focusNonce,
      showOnMap,
      mobileMapOpen,
      sidebarOpen,
      newChatNonce,
      startNewChat,
      sessions,
      sessionsLoading,
      sessionsError,
      refreshSessions,
      addOptimisticSession,
      renameSessionLocally,
      removeSessionLocally,
    ],
  );

  return <ChatShellContext.Provider value={value}>{children}</ChatShellContext.Provider>;
}
