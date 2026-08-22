"use client";

// Shared state for the /chat shell: the canvas view the Answer Canvas (AI Mode)
// or Full-Bleed Tool (Tools Mode) renders, the map highlight and focus contract,
// the AI/Tools mode toggle, the below-wide Answer Sheet, and the session list.
//
// `workspaceView` is the single source of truth for the right pane. `activeChannel`
// mirrors it as `{ id, state }` for consumers that key on `id`. `setActiveChannel`
// writes through to `workspaceView`. `activateCanvasView` and `setWorkspaceView`
// are the agent-driven and Tools-mode entry points.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useApi } from "@/src/components/providers";
import type { CanvasView, PaneId, PaneState } from "@/src/components/shell/pane-registry";
import { PANE_BY_ID } from "@/src/components/shell/pane-registry";
import { useShellMode } from "@/src/components/shell/use-shell-mode";
import type { SessionSummary, ToolCall } from "@/src/lib/api-types";
import { courseSlugToCode, parseToolSlug } from "@/src/lib/pane-route";
import type { ShellMode } from "@/src/lib/shell-mode";
import { toolCallToCanvasView } from "@/src/lib/walking";
import type { MapHighlight } from "@/src/lib/walking";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type { CanvasView, MapHighlight };
export type { ShellMode };

export type ActiveChannel = { id: PaneId; state: PaneState } | null;

export interface ChatShellState {
  workspaceView: CanvasView | null;
  setWorkspaceView: (view: CanvasView | null) => void;
  /** Loads the canvas for a mapped tool call. Unmapped calls are a no-op. */
  activateCanvasView: (call: ToolCall) => void;

  /** True when the user intentionally dismissed the pane; auto-open skips. */
  userDismissedPane: boolean;
  setUserDismissedPane: (dismissed: boolean) => void;

  mode: ShellMode;
  setMode: (mode: ShellMode) => void;

  answerSheetOpen: boolean;
  setAnswerSheetOpen: (open: boolean) => void;

  rightPaneCollapsed: boolean;
  setRightPaneCollapsed: (c: boolean) => void;

  activeChannel: ActiveChannel;
  /** Sets the active pane (`null` collapses to the map rail). */
  setActiveChannel: (id: PaneId | null, state?: PaneState) => void;

  highlight: MapHighlight | null;
  focusNonce: number;

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

export function ChatShellProvider({ initialMode = "ai", children }: { initialMode?: ShellMode; children: ReactNode }) {
  const api = useApi();
  const auth = useAppAuth();

  const [workspaceView, setWorkspaceViewState] = useState<CanvasView | null>(null);
  // Latest-value ref so setActiveChannel reads the current view without depending
  // on workspaceView in its callback deps — keeps the callback identity-stable
  // (same pattern as authRef in ApiProvider). ChatPanel's session-load effect lists
  // setActiveChannel in its deps; if it churned on every open, the effect would
  // re-run and reset workspaceView to null, closing the pane the instant a user
  // opened it.
  const workspaceViewRef = useRef<CanvasView | null>(null);
  workspaceViewRef.current = workspaceView;
  const [focusNonce, setFocusNonce] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newChatNonce, setNewChatNonce] = useState(0);
  const [mode, setMode] = useShellMode(initialMode);
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);
  // Collapses the wide AI-mode right pane: chat fills the row when true, and a
  // topbar button re-expands. Auto-expanded below when a tool activates.
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);
  // Set when the user manually dismisses the pane. Auto-open at stream-end skips
  // while this is true; an explicit widget click-toggle and session start clear it.
  const [userDismissedPane, setUserDismissedPane] = useState(false);

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

  // A collapsed pane would silently swallow tool activations (workspaceView set),
  // so expand the right pane whenever a tool becomes active — unless the user
  // previously dismissed the pane.
  const userDismissedPaneRef = useRef(false);
  userDismissedPaneRef.current = userDismissedPane;
  useEffect(() => {
    if (workspaceView !== null && !userDismissedPaneRef.current) setRightPaneCollapsed(false);
  }, [workspaceView]);

  const setWorkspaceView = useCallback((view: CanvasView | null) => {
    setWorkspaceViewState(view);
  }, []);

  const activateCanvasView = useCallback(
    (call: ToolCall) => {
      const view = toolCallToCanvasView(call);
      if (view) {
        setWorkspaceView(view);
        // Bump the focus nonce so the map re-focuses on the new highlight.
        setFocusNonce((n) => n + 1);
        // Widget-driven pane opens as a bottom sheet on mobile unless the user
        // previously dismissed the pane.
        if (!userDismissedPaneRef.current) setAnswerSheetOpen(true);
      }
    },
    [setWorkspaceView],
  );

  const setActiveChannel = useCallback((id: PaneId | null, state: PaneState = {}) => {
    setWorkspaceViewState(id ? { paneId: id, state } : null);
  }, []);

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

  const value = useMemo<ChatShellState>(
    () => ({
      workspaceView,
      setWorkspaceView,
      activateCanvasView,
      userDismissedPane,
      setUserDismissedPane,
      mode,
      setMode,
      answerSheetOpen,
      setAnswerSheetOpen,
      rightPaneCollapsed,
      setRightPaneCollapsed,
      activeChannel,
      setActiveChannel,
      highlight,
      focusNonce,
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
      userDismissedPane,
      mode,
      setMode,
      answerSheetOpen,
      rightPaneCollapsed,
      activeChannel,
      setActiveChannel,
      highlight,
      focusNonce,
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

  return (
    <ChatShellContext.Provider value={value}>
      <ToolRouteActivator />
      {children}
    </ChatShellContext.Provider>
  );
}

/** When the URL is `/tools/<slug>` (or `/tools/courses/<code>`), push the
 * matching pane state onto the workspace canvas. Mounted in ChatShellProvider
 * so it lives wherever the shell is rendered and runs the URL effect
 * independent of AppShell's chat-vs-tool layout decision. */
function ToolRouteActivator() {
  const pathname = usePathname();
  const { setActiveChannel } = useChatShell();
  useEffect(() => {
    if (!pathname?.startsWith("/tools/")) return;
    const segments = pathname.slice("/tools/".length).split("/");
    if (segments[0] === "courses" && segments[1]) {
      const code = courseSlugToCode(segments[1]);
      if (code) {
        setActiveChannel("course-lookup", { code });
        return;
      }
    }
    const paneId = parseToolSlug(segments[0]);
    if (paneId) setActiveChannel(paneId, PANE_BY_ID[paneId].defaultState);
  }, [pathname, setActiveChannel]);
  return null;
}
