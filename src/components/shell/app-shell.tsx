"use client";

// The dashboard shell: TopBar + LeftSidebar + a mode-dependent workspace
// (AI: Chat Surface + Answer Canvas; Tools: a single Full-Bleed Tool). The Answer
// Canvas is hosted here, not inside ChatPanel, so the map survives session swaps
// (REQ-9.4). Below each mode's desktop breakpoint, the AI canvas surfaces as a
// Bottom Sheet and the Tools list lives in the left drawer.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { AnswerCanvas } from "@/src/components/shell/answer-canvas";
import { AnswerSheet } from "@/src/components/shell/answer-sheet";
import { FullBleedTool } from "@/src/components/shell/full-bleed-tool";
import { LeftSidebar } from "@/src/components/shell/left-sidebar";
import { useSidebarCollapsed } from "@/src/components/shell/session-sidebar";
import {
  AnswerCanvasLoading,
  ChatPanelLoading,
  NewChatLoading,
  WorkspaceRouteLoading,
} from "@/src/components/shell/shell-loading";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { shellModeForPath } from "@/src/components/shell/use-shell-mode";
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { LiveRegion } from "@/src/components/ui/live-region";
import { useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Gate: initializing → null (brief); signed out → redirect to login. */
function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAppAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.status === "signedIn") return;
    if (auth.status === "signedOut") router.replace("/login");
  }, [auth, router]);
  if (auth.status === "signedIn") return <>{children}</>;
  return null;
}

/** Tracks when the Answer Canvas is inline for sheet cleanup and inert gating. */
function useIsCanvasInline(): boolean {
  const [inline, setInline] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(min-width: 640px)");
    setInline(media.matches);
    const onChange = (event: MediaQueryListEvent) => setInline(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return mounted ? inline : false;
}

function ShellRouteContent({
  identity,
  pending,
  children,
}: {
  identity: string;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <div
      key={identity}
      data-shell-route-content={identity}
      data-navigation-pending={pending || undefined}
      inert={pending || undefined}
      className="shell-route-content flex min-h-0 min-w-0 flex-1"
    >
      {children}
    </div>
  );
}

function SidebarDrawer() {
  const { sidebarOpen, setSidebarOpen, mode } = useChatShell();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sidebarOpen) return;
    const btn = dialogRef.current?.querySelector<HTMLElement>("button");
    btn?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sidebarOpen, setSidebarOpen]);
  const desktopHidden = mode === "tools" ? "xl:hidden" : "lg:hidden";
  return (
    <div inert={!sidebarOpen} className={sidebarOpen ? desktopHidden : `pointer-events-none ${desktopHidden}`}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
        className={`bg-scrim fixed inset-0 z-40 transition-opacity duration-250 ${desktopHidden} ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "ai" ? "Chat sessions" : mode === "tools" ? "Tools" : "Unity"}
        className={`fixed inset-y-0 left-0 z-50 w-[min(18.5rem,calc(100vw-3rem))] p-3 transition-transform duration-250 [transition-timing-function:var(--neu-ease)] ${desktopHidden}`}
        style={{ transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }}
      >
        <div className="h-full">
          <LeftSidebar onClose={() => setSidebarOpen(false)} />
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const {
    sidebarOpen,
    setSidebarOpen,
    mode,
    workspaceView,
    answerSheetOpen,
    setAnswerSheetOpen,
    rightPaneCollapsed,
    setRightPaneCollapsed,
    setUserDismissedPane,
  } = useChatShell();
  const canvasInline = useIsCanvasInline();
  const navigation = useShellNavigation();
  const pathname = navigation.displayPathname;
  const settingsRoute = pathname === "/settings";
  const [sessionsCollapsed, setSessionsCollapsed] = useSidebarCollapsed();
  const sidebarOpenRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (canvasInline && answerSheetOpen) setAnswerSheetOpen(false);
  }, [canvasInline, answerSheetOpen, setAnswerSheetOpen]);

  const sheetInert = mode === "ai" && answerSheetOpen && !canvasInline;

  // Restore focus to the sidebar drawer trigger when it closes.
  const prevSidebarOpen = useRef(false);
  useEffect(() => {
    if (prevSidebarOpen.current && !sidebarOpen) sidebarOpenRef.current?.focus();
    prevSidebarOpen.current = sidebarOpen;
  }, [sidebarOpen]);

  function collapseSessions() {
    setSessionsCollapsed(true);
    requestAnimationFrame(() => document.getElementById("desktop-session-collapse")?.focus());
  }
  function expandSessions() {
    setSessionsCollapsed(false);
    requestAnimationFrame(() => document.getElementById("desktop-session-collapse")?.focus());
  }
  function collapseRightPane() {
    setRightPaneCollapsed(true);
  }

  const enteringAi = navigation.pending && mode === "ai" && shellModeForPath(navigation.committedPathname) !== "ai";
  const routeIdentity = `${mode}:${pathname}`;
  const routeContent = settingsRoute ? (
    <ShellRouteContent identity={routeIdentity} pending={navigation.pending}>
      <main
        id="main-content"
        data-pane="settings"
        data-shell-mode={mode}
        className={`flex min-h-0 min-w-0 flex-1 ${
          mode === "tools" ? "tool-sidebar-content-offset" : "sidebar-content-offset"
        }`}
      >
        <WorkspaceHostProvider host="settings" menuClearance>
          <div data-workspace-surface className="workspace-surface flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {navigation.pending ? <WorkspaceRouteLoading label="Loading Settings" /> : children}
          </div>
        </WorkspaceHostProvider>
      </main>
    </ShellRouteContent>
  ) : mode === "ai" ? (
    <div className="chat-map-area flex min-h-0 min-w-0 flex-1">
      <ShellRouteContent identity={routeIdentity} pending={navigation.pending}>
        <main
          id="main-content"
          data-pane="chat"
          className="sidebar-content-offset flex min-h-0 min-w-0 flex-1 lg:min-w-88"
          inert={sheetInert || undefined}
        >
          {navigation.pending ? pathname === "/chat" ? <NewChatLoading /> : <ChatPanelLoading /> : children}
        </main>
      </ShellRouteContent>
      <AnswerSheet
        open={enteringAi ? false : answerSheetOpen}
        onClose={() => {
          collapseRightPane();
          setAnswerSheetOpen(false);
          setUserDismissedPane(true);
        }}
        collapsed={rightPaneCollapsed}
        view={workspaceView}
      >
        {enteringAi ? <AnswerCanvasLoading /> : <AnswerCanvas view={workspaceView} />}
      </AnswerSheet>
    </div>
  ) : (
    <ShellRouteContent identity={routeIdentity} pending={navigation.pending}>
      <main
        id="main-content"
        data-pane={mode === "tools" ? "tool" : "unity"}
        className={`flex min-h-0 min-w-0 flex-1 ${
          mode === "tools" ? "tool-sidebar-content-offset" : "sidebar-content-offset"
        }`}
      >
        <WorkspaceHostProvider host={mode === "tools" ? "tools" : "unity"} menuClearance>
          <div data-workspace-surface className="workspace-surface flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {mode === "tools" && workspaceView ? (
              <FullBleedTool view={workspaceView} />
            ) : navigation.pending ? (
              <WorkspaceRouteLoading label="Loading Unity" />
            ) : (
              children
            )}
          </div>
        </WorkspaceHostProvider>
      </main>
    </ShellRouteContent>
  );

  return (
    <RequireAuth>
      <div className="app-shell-canvas flex h-svh flex-col overflow-hidden">
        <a
          href="#main-content"
          className="focus-visible:bg-primary focus-visible:text-on-primary sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[100] focus-visible:rounded-xl focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium"
        >
          Skip to main content
        </a>
        {/* Mobile-only drawer trigger: the former top bar's duties (brand,
            theme, account) live in the sidebar now. */}
        <button
          ref={sidebarOpenRef}
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
          inert={sidebarOpen || undefined}
          className={`neu-panel bg-surface text-on-surface-variant hover:text-primary fixed top-3 left-3 z-40 flex size-11 items-center justify-center rounded-xl transition-colors duration-150 ${mode === "tools" ? "xl:hidden" : "lg:hidden"}`}
        >
          <Icon name="menu" size={21} />
        </button>

        <SidebarDrawer />

        <div inert={sidebarOpen || undefined} className="shell-body min-h-0 flex-1">
          <div
            data-sidebar-collapsed={sessionsCollapsed || undefined}
            className="chat-workspace relative min-h-0 min-w-0 flex-1 p-3"
          >
            <aside
              aria-label={mode === "ai" ? "Chat sessions" : mode === "tools" ? "Tools" : "Unity"}
              className={`sessions-aside absolute top-3 bottom-3 left-3 z-10 hidden min-h-0 overflow-hidden ${mode === "tools" ? "xl:block" : "lg:block"} ${reduce ? "" : "transition-[width] duration-300 ease-[var(--neu-ease)]"}`}
            >
              <div className="h-full">
                <LeftSidebar collapsed={sessionsCollapsed} onCollapse={collapseSessions} onExpand={expandSessions} />
              </div>
            </aside>
            <div
              data-shell-route-stage
              aria-busy={navigation.pending}
              className="shell-route-stage relative isolate flex min-h-0 min-w-0 flex-1"
            >
              {routeContent}
              {navigation.pending ? (
                <div
                  data-shell-navigation-pending={navigation.target ?? ""}
                  role="status"
                  aria-label="Loading destination"
                  className="shell-navigation-progress pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden"
                >
                  <span className="bg-primary block h-full origin-left rounded-full" />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <LiveRegion />
      </div>
    </RequireAuth>
  );
}
