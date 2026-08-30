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
import { LAST_CHAT_PATH_KEY, type ShellMode } from "@/src/lib/shell-mode";
import { toolCallToCanvasView } from "@/src/lib/walking";
import type { MapHighlight } from "@/src/lib/walking";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type { CanvasView, MapHighlight };
export type { ShellMode };

export type ActiveChannel = { id: PaneId; state: PaneState } | null;

export interface ChatShellState {
  workspaceView: CanvasView | null;
  setWorkspaceView: (view: CanvasView | null) => void;
  /** Loads the canvas for a mapped tool call. Unmapped calls are a no-op. When
   *  `callKey` identifies the chip that triggered it, only that chip highlights. */
  activateCanvasView: (call: ToolCall, callKey?: string) => void;

  /** Key of the tool-call chip that opened the current pane; only that chip shows
   *  the active highlight. Null when the pane was opened another way. */
  activeCallKey: string | null;

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

  /** Pending "ask the AI this" request (e.g. from a pane's context menu).
   *  ChatPanel consumes it by nonce and sends it as a user message. */
  askAiRequest: { text: string; nonce: number } | null;
  /** Switches to AI mode and queues `text` to be sent as a chat message. */
  askAi: (text: string) => void;
}

const ChatShellContext = createContext<ChatShellState | null>(null);

export function useChatShell(): ChatShellState {
  const value = useContext(ChatShellContext);
  if (!value) throw new Error("useChatShell must be used within <ChatShellProvider>");
  return value;
}

/** Null-safe variant for components that also render outside the shell (tests,
 *  embedded widgets) — shell-dependent affordances no-op when absent. */
export function useChatShellOptional(): ChatShellState | null {
  return useContext(ChatShellContext);
}

/** `useRouter` that tolerates hosts without a mounted app router (tests render
 *  the provider standalone). The hook is still called unconditionally — only
 *  Next's mount invariant is caught. */
function useRouterSafe(): ReturnType<typeof useRouter> | null {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: called unconditionally on every render — the try only catches Next's router-mount invariant.
    return useRouter();
  } catch {
    return null;
  }
}

export function ChatShellProvider({ initialMode = "ai", children }: { initialMode?: ShellMode; children: ReactNode }) {
  const api = useApi();
  const auth = useAppAuth();
  const router = useRouterSafe();

  const [workspaceView, setWorkspaceViewState] = useState<CanvasView | null>(null);
  const [activeCallKey, setActiveCallKey] = useState<string | null>(null);
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
  // topbar button re-expands. Auto-expanded below when a tool activates. The
  // public setter also clears the chip highlight on collapse, so a closed pane
  // leaves no chip marked active.
  const [rightPaneCollapsed, setRightPaneCollapsedState] = useState(true);
  const setRightPaneCollapsed = useCallback((c: boolean) => {
    setRightPaneCollapsedState(c);
    if (c) setActiveCallKey(null);
  }, []);
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
    if (view === null) setActiveCallKey(null);
  }, []);

  const activateCanvasView = useCallback(
    (call: ToolCall, callKey?: string) => {
      const view = toolCallToCanvasView(call);
      if (view) {
        setWorkspaceView(view);
        setActiveCallKey(callKey ?? null);
        setRightPaneCollapsedState(false);
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
    setActiveCallKey(null);
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

  const [askAiRequest, setAskAiRequest] = useState<{ text: string; nonce: number } | null>(null);
  const isGuestRef = useRef(auth.isGuest);
  isGuestRef.current = auth.isGuest;
  const askAi = useCallback(
    (text: string) => {
      // AI mode is guest-locked (same gate as the mode toggle).
      if (isGuestRef.current) return;
      setMode("ai");
      setAskAiRequest((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
      // Mode derives from the URL, so switching to AI means navigating to the
      // chat route — restore the last-visited chat like the mode toggle does.
      let target = "/chat";
      try {
        const last = sessionStorage.getItem(LAST_CHAT_PATH_KEY);
        if (last?.startsWith("/chat")) target = last;
      } catch {
        /* sessionStorage unavailable */
      }
      router?.push(target);
    },
    [setMode, router],
  );

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
      activeCallKey,
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
      askAiRequest,
      askAi,
    }),
    [
      workspaceView,
      setWorkspaceView,
      activateCanvasView,
      activeCallKey,
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
      askAiRequest,
      askAi,
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
