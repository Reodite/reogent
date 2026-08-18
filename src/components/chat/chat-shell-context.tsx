"use client";

// Shared state for the /chat shell: the canvas view the Answer Canvas (AI Mode)
// or Full-Bleed Tool (Tools Mode) renders, the map highlight and focus contract,
// the AI/Tools mode toggle, the below-wide Answer Sheet, and the session list.
//
// `workspaceView` is the single source of truth for the right pane. `activeChannel`
// mirrors it as `{ id, state }` for consumers that key on `id`, so the staged move
// onto `workspaceView` keeps existing readers intact. `setActiveChannel` and
// `showOnMap` capture the prior user-tool channel into `previousUserChannel` when
// switching the canvas to the map (the "Back to" pill). `activateCanvasView` and
// `setWorkspaceView` skip that capture: the agent-driven and Tools-mode path has
// no user-tool to return to.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useApi } from "@/src/components/providers";
import type { CanvasView, PaneId, PaneState } from "@/src/components/shell/pane-registry";
import { useShellMode } from "@/src/components/shell/use-shell-mode";
import type { SessionSummary, ToolCall } from "@/src/lib/api-types";
import type { ShellMode } from "@/src/lib/shell-mode";
import { toolCallToCanvasView } from "@/src/lib/walking";
import type { MapHighlight } from "@/src/lib/walking";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type { CanvasView, MapHighlight };
export type { ShellMode };

export type ActiveChannel = { id: PaneId; state: PaneState } | null;
export type PreviousUserChannel = { id: PaneId; state: PaneState } | null;

export interface ChatShellState {
  workspaceView: CanvasView | null;
  setWorkspaceView: (view: CanvasView | null) => void;
  /** Loads the canvas for a mapped tool call. Unmapped calls are a no-op. */
  activateCanvasView: (call: ToolCall) => void;

  mode: ShellMode;
  setMode: (mode: ShellMode) => void;

  answerSheetOpen: boolean;
  setAnswerSheetOpen: (open: boolean) => void;

  activeChannel: ActiveChannel;
  previousUserChannel: PreviousUserChannel;
  /** Sets the active pane. Switching to `map` from a user tool captures the prior channel for the "Back to" pill. `null` collapses to the rail. */
  setActiveChannel: (id: PaneId | null, state?: PaneState) => void;
  setPreviousUserChannel: (channel: PreviousUserChannel) => void;

  highlight: MapHighlight | null;
  mapOpen: boolean;
  focusNonce: number;
  /** Opens the map pane with the payload, re-focuses the route, and opens the mobile sheet on small viewports. */
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

  const [workspaceView, setWorkspaceViewState] = useState<CanvasView | null>(null);
  // Latest-value ref so setActiveChannel/showOnMap read the current view without
  // depending on workspaceView in their callback deps — keeps the callbacks
  // identity-stable (same pattern as authRef in ApiProvider). ChatPanel's
  // session-load effect lists setActiveChannel in its deps; if it churned on
  // every open, the effect would re-run and reset workspaceView to null,
  // closing the pane the instant a user opened it.
  const workspaceViewRef = useRef<CanvasView | null>(null);
  workspaceViewRef.current = workspaceView;
  const [previousUserChannel, setPreviousUserChannelState] = useState<PreviousUserChannel>(readPreviousUserChannel);
  const [focusNonce, setFocusNonce] = useState(0);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newChatNonce, setNewChatNonce] = useState(0);
  const [mode, setMode] = useShellMode();
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);

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

  const setWorkspaceView = useCallback((view: CanvasView | null) => {
    setWorkspaceViewState(view);
  }, []);

  const setPreviousUserChannel = useCallback((channel: PreviousUserChannel) => {
    setPreviousUserChannelState(channel);
    writePreviousUserChannel(channel);
  }, []);

  // Switching the canvas to the map from a user tool captures the prior channel
  // for the "Back to" pill; switching to any other tool clears it.
  const capturePreviousForMap = useCallback((prev: CanvasView | null, next: CanvasView | null) => {
    if (next?.paneId === "map" && prev && prev.paneId !== "map") {
      const captured: PreviousUserChannel = { id: prev.paneId, state: prev.state };
      setPreviousUserChannelState(captured);
      writePreviousUserChannel(captured);
    } else if (next && next.paneId !== "map") {
      setPreviousUserChannelState(null);
      writePreviousUserChannel(null);
    }
  }, []);

  const activateCanvasView = useCallback(
    (call: ToolCall) => {
      const view = toolCallToCanvasView(call);
      if (view) setWorkspaceView(view);
    },
    [setWorkspaceView],
  );

  const setActiveChannel = useCallback(
    (id: PaneId | null, state: PaneState = {}) => {
      const next: CanvasView | null = id ? { paneId: id, state } : null;
      capturePreviousForMap(workspaceViewRef.current, next);
      setWorkspaceViewState(next);
    },
    [capturePreviousForMap],
  );

  const showOnMap = useCallback(
    (highlight: MapHighlight) => {
      const next: CanvasView = { paneId: "map", state: { highlight } };
      capturePreviousForMap(workspaceViewRef.current, next);
      setWorkspaceViewState(next);
      setFocusNonce((n) => n + 1);
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
        setMobileMapOpen(true);
      }
    },
    [capturePreviousForMap],
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

  const activeChannel = useMemo<ActiveChannel>(
    () => (workspaceView ? { id: workspaceView.paneId, state: workspaceView.state } : null),
    [workspaceView],
  );
  const highlight: MapHighlight | null =
    activeChannel?.id === "map" ? ((activeChannel.state.highlight as MapHighlight | undefined) ?? null) : null;
  const mapOpen = activeChannel?.id === "map";

  const value = useMemo<ChatShellState>(
    () => ({
      workspaceView,
      setWorkspaceView,
      activateCanvasView,
      mode,
      setMode,
      answerSheetOpen,
      setAnswerSheetOpen,
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
      workspaceView,
      setWorkspaceView,
      activateCanvasView,
      mode,
      setMode,
      answerSheetOpen,
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
