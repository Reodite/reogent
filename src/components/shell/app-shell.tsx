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
import { UserMenu } from "@/src/components/shell/user-menu";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { LiveRegion } from "@/src/components/ui/live-region";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
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
        className="bg-scrim fixed inset-0 z-40 transition-opacity duration-250 lg:hidden"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "ai" ? "Chat sessions" : "Tools"}
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
  const { sidebarOpen, setSidebarOpen, mode, workspaceView, answerSheetOpen, setAnswerSheetOpen, highlight } =
    useChatShell();
  const wide = useIsWide();
  const [sessionsCollapsed, setSessionsCollapsed] = useSidebarCollapsed();
  const sessionsMenuRef = useRef<HTMLButtonElement>(null);
  const mapEntryRef = useRef<HTMLButtonElement>(null);
  const sidebarOpenRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  // Crossing to wide closes a lingering Answer sheet (the button that opens it
  // is hidden at wide); nothing else needs this, so a one-shot close suffices.
  useEffect(() => {
    if (wide && answerSheetOpen) setAnswerSheetOpen(false);
  }, [wide, answerSheetOpen, setAnswerSheetOpen]);

  const sheetInert = mode === "ai" && answerSheetOpen && !wide;

  // Restore focus to the triggering control when a sheet or drawer closes.
  const prevSheetOpen = useRef(false);
  useEffect(() => {
    if (prevSheetOpen.current && !answerSheetOpen && !wide) mapEntryRef.current?.focus();
    prevSheetOpen.current = answerSheetOpen;
  }, [answerSheetOpen, wide]);
  const prevSidebarOpen = useRef(false);
  useEffect(() => {
    if (prevSidebarOpen.current && !sidebarOpen) sidebarOpenRef.current?.focus();
    prevSidebarOpen.current = sidebarOpen;
  }, [sidebarOpen]);

  function collapseSessions() {
    setSessionsCollapsed(true);
    requestAnimationFrame(() => sessionsMenuRef.current?.focus());
  }
  function expandSessions() {
    setSessionsCollapsed(false);
    requestAnimationFrame(() => document.getElementById("desktop-session-collapse")?.focus());
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
        <motion.header
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          inert={sidebarOpen || sheetInert || undefined}
          className="neu-panel relative z-30 mx-2 mt-3 flex h-14 shrink-0 items-center justify-between rounded-2xl px-2 sm:mx-3 sm:px-4"
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              ref={sidebarOpenRef}
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              className="neu-button bg-surface text-on-surface-variant hover:text-primary flex size-11 shrink-0 items-center justify-center rounded-xl sm:size-9 lg:hidden"
            >
              <Icon name="menu" size={21} />
            </button>
            <Link
              href="/"
              aria-label="Go to Reodite homepage"
              className="group flex min-w-0 items-center gap-2 rounded-xl py-1 pr-2 focus-visible:outline-offset-4"
            >
              <span className="bg-surface-container-low text-primary group-hover:text-on-surface hidden size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 sm:flex">
                <Icon name="school" size={17} />
              </span>
              <span className="text-primary group-hover:text-on-surface truncate text-base font-medium tracking-[-0.025em] transition-colors duration-150 sm:text-xl">
                Reodite
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {mode === "ai" && (
              <button
                ref={mapEntryRef}
                type="button"
                onClick={() => setAnswerSheetOpen(true)}
                aria-label="Open answer canvas"
                aria-expanded={answerSheetOpen}
                className="neu-button bg-surface text-on-surface-variant hover:text-primary relative flex size-11 items-center justify-center rounded-xl sm:size-9 lg:hidden"
              >
                <Icon name="map" size={19} />
                {highlight && !answerSheetOpen && (
                  <span className="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full" aria-hidden="true" />
                )}
              </button>
            )}
            <ThemeToggle className="hidden sm:grid" />
            <UserMenu />
          </div>
        </motion.header>

        <SidebarDrawer />

        <div inert={sidebarOpen || undefined} className="shell-body min-h-0 flex-1">
          <div className="chat-workspace min-h-0 min-w-0 flex-1 gap-3 p-3">
            <motion.aside
              aria-label={mode === "ai" ? "Chat sessions" : "Tools"}
              animate={{ width: sessionsCollapsed ? "3.75rem" : "17rem" }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
              className="sessions-aside relative hidden min-h-0 min-w-0 overflow-hidden lg:block"
            >
              <div
                className={`sessions-panel-layer h-full w-[17rem] transition-opacity duration-200 ${sessionsCollapsed ? "pointer-events-none opacity-0" : "opacity-100 delay-75"}`}
              >
                <LeftSidebar onCollapse={collapseSessions} />
              </div>
              <div
                className={`neu-panel text-on-surface-variant absolute inset-y-0 left-0 flex w-[3.75rem] flex-col items-center rounded-2xl py-3 transition-opacity duration-200 ${sessionsCollapsed ? "opacity-100" : "pointer-events-none opacity-0"}`}
              >
                <button
                  ref={sessionsMenuRef}
                  type="button"
                  onClick={expandSessions}
                  tabIndex={sessionsCollapsed ? 0 : -1}
                  aria-label="Expand sidebar"
                  aria-controls="desktop-session-panel"
                  aria-expanded={!sessionsCollapsed}
                  title="Expand sidebar"
                  className="neu-panel text-primary hover:text-on-surface flex size-9 items-center justify-center rounded-xl transition-colors duration-150"
                >
                  <Icon name="menu" size={20} />
                </button>
                <span className="mt-4 text-xs font-medium tracking-[0.06em] select-none [writing-mode:vertical-rl]">
                  Sidebar
                </span>
              </div>
            </motion.aside>
            {mode === "ai" ? (
              <div className="chat-map-area flex min-h-0 min-w-0 flex-1 gap-3">
                <main
                  id="main-content"
                  data-pane="chat"
                  className="flex min-h-0 min-w-0 flex-1 lg:min-w-88"
                  inert={sheetInert || undefined}
                >
                  {children}
                </main>
                <AnswerSheet open={answerSheetOpen} onClose={() => setAnswerSheetOpen(false)}>
                  <AnswerCanvas view={workspaceView} />
                </AnswerSheet>
              </div>
            ) : (
              <main id="main-content" data-pane="tool" className="flex min-h-0 min-w-0 flex-1">
                <FullBleedTool view={workspaceView} />
              </main>
            )}
          </div>
        </div>

        <LiveRegion />
      </div>
    </RequireAuth>
  );
}
