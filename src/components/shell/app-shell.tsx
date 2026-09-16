"use client";

// Hosts the sidebar and mode-dependent workspace. The Answer Canvas remains
// mounted across chat session swaps and becomes a bottom sheet below 640px.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { AnswerCanvas } from "@/src/components/shell/answer-canvas";
import { AnswerSheet } from "@/src/components/shell/answer-sheet";
import { FullBleedTool } from "@/src/components/shell/full-bleed-tool";
import { LeftSidebar } from "@/src/components/shell/left-sidebar";
import { ModeToggle } from "@/src/components/shell/mode-toggle";
import { useSidebarCollapsed } from "@/src/components/shell/session-sidebar";
import {
  AnswerCanvasLoading,
  ChatPanelLoading,
  NewChatLoading,
  WorkspaceRouteLoading,
} from "@/src/components/shell/shell-loading";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { useMobileViewport } from "@/src/components/shell/use-mobile-viewport";
import { shellModeForPath } from "@/src/components/shell/use-shell-mode";
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { lockBodyScroll } from "@/src/components/ui/body-scroll-lock";
import { Button } from "@/src/components/ui/button";
import { tabStops } from "@/src/components/ui/floating-panel";
import { LiveRegion } from "@/src/components/ui/live-region";
import { useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
  animate,
  reducedMotion,
  children,
}: {
  identity: string;
  pending: boolean;
  animate: boolean;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousIdentityRef = useRef(identity);

  useLayoutEffect(() => {
    const previousIdentity = previousIdentityRef.current;
    previousIdentityRef.current = identity;
    if (!animate || reducedMotion || previousIdentity === identity) return;
    const animation = contentRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], {
      duration: 180,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
    return () => animation?.cancel();
  }, [animate, identity, reducedMotion]);

  return (
    <div
      ref={contentRef}
      data-shell-route-content={identity}
      data-route-transition={animate || undefined}
      data-navigation-pending={pending || undefined}
      className="shell-route-content flex min-h-0 min-w-0 flex-1"
    >
      {children}
    </div>
  );
}

function SidebarDrawer({ id }: { id: string }) {
  const { sidebarOpen, setSidebarOpen, mode } = useChatShell();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sidebarOpen) return;
    const btn = dialogRef.current?.querySelector<HTMLElement>("button");
    btn?.focus();
    const releaseScroll = lockBodyScroll();
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || event.defaultPrevented || dialog.closest("[inert]")) return;
      if (event.target instanceof Element && event.target.closest("[data-floating-panel], [data-dialog-root]")) return;
      if (event.key === "Escape") {
        const trigger =
          event.target instanceof Element ? event.target.closest("[aria-controls], [aria-describedby]") : null;
        const popupIds =
          `${trigger?.getAttribute("aria-controls") ?? ""} ${trigger?.getAttribute("aria-describedby") ?? ""}`.split(
            /\s+/,
          );
        if (popupIds.some((popupId) => document.getElementById(popupId)?.hasAttribute("data-floating-panel"))) return;
        event.preventDefault();
        setSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const stops = tabStops(dialog);
      const first = stops[0] ?? dialog;
      const last = stops.at(-1) ?? dialog;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      releaseScroll();
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
        id={id}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={mode === "ai" ? "Chat sessions" : mode === "tools" ? "Tools" : "Unity"}
        className={`shell-sidebar-drawer fixed inset-y-0 left-0 z-50 w-[min(18.5rem,calc(100vw-3rem))] p-3 duration-250 [transition-timing-function:var(--neu-ease)] ${desktopHidden} ${sidebarOpen ? "visible transition-transform" : "invisible transition-[transform,visibility]"}`}
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
  const routeIdentity = `${mode}:${pathname}`;
  const initialRouteIdentityRef = useRef(routeIdentity);
  const [hasNavigated, setHasNavigated] = useState(false);
  const animateRoute = hasNavigated || routeIdentity !== initialRouteIdentityRef.current;
  const [sessionsCollapsed, setSessionsCollapsed] = useSidebarCollapsed();
  const sidebarOpenRef = useRef<HTMLButtonElement>(null);
  const sidebarId = useId();
  const viewportRef = useMobileViewport();
  const desktopSidebarQuery = mode === "tools" ? "(min-width: 1280px)" : "(min-width: 1024px)";
  const reduce = useReducedMotion();

  useEffect(() => {
    if (routeIdentity !== initialRouteIdentityRef.current) setHasNavigated(true);
  }, [routeIdentity]);

  useEffect(() => {
    if (canvasInline && answerSheetOpen) setAnswerSheetOpen(false);
  }, [canvasInline, answerSheetOpen, setAnswerSheetOpen]);

  const enteringAi = navigation.pending && mode === "ai" && shellModeForPath(navigation.committedPathname) !== "ai";
  const sheetOpen = mode === "ai" && !settingsRoute && !canvasInline && !enteringAi && answerSheetOpen;

  useEffect(() => {
    if (!sidebarOpen) return;
    const media = window.matchMedia(desktopSidebarQuery);
    const closeOnDesktop = () => {
      if (media.matches) setSidebarOpen(false);
    };
    closeOnDesktop();
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [desktopSidebarQuery, sidebarOpen, setSidebarOpen]);

  // Restore focus to the sidebar control visible at the current breakpoint.
  const prevSidebarOpen = useRef(false);
  useEffect(() => {
    if (prevSidebarOpen.current && !sidebarOpen) {
      const target = window.matchMedia(desktopSidebarQuery).matches
        ? document.getElementById("desktop-session-collapse")
        : sidebarOpenRef.current;
      target?.focus();
    }
    prevSidebarOpen.current = sidebarOpen;
  }, [desktopSidebarQuery, sidebarOpen]);

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

  const sidebarToggle = (
    <Button
      ref={sidebarOpenRef}
      onClick={() => setSidebarOpen(true)}
      aria-label="Open sidebar"
      aria-expanded={sidebarOpen}
      aria-controls={sidebarId}
      aria-haspopup="dialog"
      variant="ghost"
      size="fieldIcon"
      className={`shell-menu-trigger ${mode === "tools" ? "xl:hidden" : "lg:hidden"}`}
    >
      <Icon name="menu" size={22} />
    </Button>
  );
  const routeContent = settingsRoute ? (
    <ShellRouteContent
      identity={routeIdentity}
      pending={navigation.pending}
      animate={animateRoute}
      reducedMotion={Boolean(reduce)}
    >
      <main
        id="main-content"
        data-pane="settings"
        data-shell-mode={mode}
        className={`flex min-h-0 min-w-0 flex-1 ${
          mode === "tools" ? "tool-sidebar-content-offset" : "sidebar-content-offset"
        }`}
      >
        <WorkspaceHostProvider host="settings" navigation={sidebarToggle}>
          <div data-workspace-surface className="workspace-surface flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {navigation.pending ? <WorkspaceRouteLoading label="Loading Settings" composition="split" /> : children}
          </div>
        </WorkspaceHostProvider>
      </main>
    </ShellRouteContent>
  ) : mode === "ai" ? (
    <div className="chat-map-area sidebar-content-offset flex min-h-0 min-w-0 flex-1">
      <ShellRouteContent
        identity={routeIdentity}
        pending={navigation.pending}
        animate={animateRoute}
        reducedMotion={Boolean(reduce)}
      >
        <main
          id="main-content"
          data-pane="chat"
          className="flex min-h-0 min-w-0 flex-1 lg:min-w-88"
          inert={sheetOpen || undefined}
        >
          <WorkspaceHostProvider host="chat" navigation={sidebarToggle}>
            {navigation.pending ? pathname === "/chat" ? <NewChatLoading /> : <ChatPanelLoading /> : children}
          </WorkspaceHostProvider>
        </main>
      </ShellRouteContent>
      <AnswerSheet
        open={sheetOpen}
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
    <ShellRouteContent
      identity={routeIdentity}
      pending={navigation.pending}
      animate={animateRoute}
      reducedMotion={Boolean(reduce)}
    >
      <main
        id="main-content"
        data-pane={mode === "tools" ? "tool" : "unity"}
        className={`flex min-h-0 min-w-0 flex-1 ${
          mode === "tools" ? "tool-sidebar-content-offset" : "sidebar-content-offset"
        }`}
      >
        <WorkspaceHostProvider host={mode === "tools" ? "tools" : "unity"} navigation={sidebarToggle}>
          <div data-workspace-surface className="workspace-surface flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {mode === "tools" && workspaceView ? (
              <FullBleedTool view={workspaceView} />
            ) : navigation.pending ? (
              <WorkspaceRouteLoading
                label="Loading Unity"
                composition={pathname.startsWith("/pulse/schedule") ? "split" : "single"}
                controls={pathname.startsWith("/pulse/schedule")}
              />
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
      <div ref={viewportRef} className="app-shell-canvas app-shell-frame flex h-dvh flex-col overflow-hidden">
        <nav aria-label="Skip links" inert={sidebarOpen || sheetOpen || undefined} className="shrink-0">
          <a
            href="#main-content"
            className="focus-visible:bg-primary focus-visible:text-on-primary sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[100] focus-visible:rounded-xl focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium"
          >
            Skip to main content
          </a>
        </nav>
        <SidebarDrawer id={sidebarId} />

        {/* The flex-item layer keeps sheets above navigation and below the sidebar drawer. */}
        <div inert={sidebarOpen || undefined} className="shell-body z-10 min-h-0 flex-1">
          <div
            data-sidebar-collapsed={sessionsCollapsed || undefined}
            className="chat-workspace relative min-h-0 min-w-0 flex-1"
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
                  className="shell-navigation-progress pointer-events-none absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden"
                >
                  <span className="bg-primary block h-full origin-left rounded-full" />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div data-mobile-navigation inert={sidebarOpen || sheetOpen || undefined} className="shrink-0 sm:hidden">
          <ModeToggle presentation="bottom" />
        </div>
        <LiveRegion />
      </div>
    </RequireAuth>
  );
}
