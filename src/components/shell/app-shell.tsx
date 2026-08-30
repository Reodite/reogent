"use client";

// The dashboard shell: TopBar + LeftSidebar + a mode-dependent workspace
// (AI: Chat Surface + Answer Canvas; Tools: a single Full-Bleed Tool). The Answer
// Canvas is hosted here, not inside ChatPanel, so the map survives session swaps
// (REQ-9.4). Below wide, the AI canvas surfaces as a Bottom Sheet and the Tools
// Tool List lives in the left drawer.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { AnswerCanvas } from "@/src/components/shell/answer-canvas";
import { AnswerSheet } from "@/src/components/shell/answer-sheet";
import { FullBleedTool } from "@/src/components/shell/full-bleed-tool";
import { LeftSidebar } from "@/src/components/shell/left-sidebar";
import { useSidebarCollapsed } from "@/src/components/shell/session-sidebar";
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

/** Wide viewport (≥1024px) for sheet auto-close and `inert` gating only. Layout
 *  itself is CSS-responsive, so the DOM is stable across this toggle — no
 *  hydration mismatch. Returns false until mounted (SSR-safe). */
function useIsWide(): boolean {
  const [wide, setWide] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const m = window.matchMedia("(min-width: 1024px)");
    setWide(m.matches);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  return mounted ? wide : false;
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
  return (
    <div inert={!sidebarOpen} className={sidebarOpen ? "lg:hidden" : "pointer-events-none lg:hidden"}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
        className={`bg-scrim fixed inset-0 z-40 transition-opacity duration-250 lg:hidden ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "ai" ? "Chat sessions" : mode === "tools" ? "Tools" : "Unity"}
        className="fixed inset-y-0 left-0 z-50 w-[min(18.5rem,calc(100vw-3rem))] p-3 transition-transform duration-250 [transition-timing-function:var(--neu-ease)] lg:hidden"
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
  const wide = useIsWide();
  const [sessionsCollapsed, setSessionsCollapsed] = useSidebarCollapsed();
  const sidebarOpenRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  // Crossing to wide closes a lingering Answer sheet (the button that opens it
  // is hidden at wide); nothing else needs this, so a one-shot close suffices.
  useEffect(() => {
    if (wide && answerSheetOpen) setAnswerSheetOpen(false);
  }, [wide, answerSheetOpen, setAnswerSheetOpen]);

  const sheetInert = mode === "ai" && answerSheetOpen && !wide;

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
          className="neu-panel bg-surface text-on-surface-variant hover:text-primary fixed top-3 left-3 z-30 flex size-11 items-center justify-center rounded-xl transition-colors duration-150 lg:hidden"
        >
          <Icon name="menu" size={21} />
        </button>

        <SidebarDrawer />

        <div inert={sidebarOpen || undefined} className="shell-body min-h-0 flex-1">
          <div
            className="chat-workspace relative min-h-0 min-w-0 flex-1 p-3"
            style={{ "--sidebar-offset": sessionsCollapsed ? "3.75rem" : "17.75rem" } as React.CSSProperties}
          >
            <aside
              aria-label={mode === "ai" ? "Chat sessions" : mode === "tools" ? "Tools" : "Unity"}
              style={{ width: sessionsCollapsed ? "3rem" : "17rem" }}
              className={`sessions-aside absolute top-3 bottom-3 left-3 z-10 hidden min-h-0 overflow-hidden lg:block ${reduce ? "" : "transition-[width] duration-300 ease-[var(--neu-ease)]"}`}
            >
              <div className="h-full">
                <LeftSidebar collapsed={sessionsCollapsed} onCollapse={collapseSessions} onExpand={expandSessions} />
              </div>
            </aside>
            {mode === "ai" ? (
              <div className="chat-map-area flex min-h-0 min-w-0 flex-1 gap-3">
                <main
                  id="main-content"
                  data-pane="chat"
                  className="sidebar-content-offset flex min-h-0 min-w-0 flex-1 lg:min-w-88"
                  inert={sheetInert || undefined}
                >
                  {children}
                </main>
                <AnswerSheet
                  open={answerSheetOpen}
                  onClose={() => {
                    collapseRightPane();
                    setAnswerSheetOpen(false);
                    setUserDismissedPane(true);
                  }}
                  collapsed={rightPaneCollapsed}
                  view={workspaceView}
                >
                  <AnswerCanvas view={workspaceView} />
                </AnswerSheet>
              </div>
            ) : mode === "unity" ? (
              <main id="main-content" data-pane="unity" className="sidebar-content-offset flex min-h-0 min-w-0 flex-1">
                {children}
              </main>
            ) : (
              <main id="main-content" data-pane="tool" className="sidebar-content-offset flex min-h-0 min-w-0 flex-1">
                {workspaceView ? <FullBleedTool view={workspaceView} /> : children}
              </main>
            )}
          </div>
        </div>

        <LiveRegion />
      </div>
    </RequireAuth>
  );
}
