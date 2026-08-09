"use client";

// The /chat workspace: header, recessed sidebar (drawer below lg), chat panel
// (route children), and the map panel — side-by-side and collapsible on desktop,
// bottom sheet on mobile.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { MapBottomSheet, MapPanel } from "@/src/components/map/map-panel";
import { SessionSidebar } from "@/src/components/shell/session-sidebar";
import { UserMenu } from "@/src/components/shell/user-menu";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const SPLASH_TIPS = [
  "Walking routes draw on the campus map.",
  "Grade data goes back several years.",
  "Tuition estimates break down by program.",
  "Room schedules update with real availability.",
  "Ask about any building to see it on the map.",
];

function Splash({ label }: { label: string }) {
  // Tip is random per mount; suppress hydration warning on this element only
  const [tip] = useState(() => SPLASH_TIPS[Math.floor(Math.random() * SPLASH_TIPS.length)]);
  return (
    <div className="app-shell-canvas flex min-h-svh items-center justify-center">
      <div className="neu-panel bg-surface flex flex-col items-center gap-3 rounded-2xl px-10 py-8">
        <span className="bg-primary-container text-on-primary-container shadow-inset flex size-11 items-center justify-center rounded-xl">
          <Icon name="school" size={22} />
        </span>
        <span className="text-primary animate-pulse text-xl font-medium tracking-[-0.02em]">Reogent</span>
        <span className="text-body-sm text-muted">{label}</span>
        <span className="text-muted mt-1 max-w-48 text-center text-xs" suppressHydrationWarning>
          {tip}
        </span>
      </div>
    </div>
  );
}

/** Gate: initializing → splash; signed out → redirect to landing/login. */
function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAppAuth();
  const router = useRouter();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (auth.status === "signedIn") {
      wasSignedIn.current = true;
      return;
    }
    if (auth.status === "signedOut") {
      // Ignore transient signedOut if user was recently signedIn (token refresh race)
      if (wasSignedIn.current) {
        const timer = setTimeout(() => {
          if (auth.status === "signedOut") router.replace("/login");
        }, 500);
        return () => clearTimeout(timer);
      }
      router.replace("/login");
    }
  }, [auth, router]);

  if (auth.status === "signedIn") return <>{children}</>;

  if (auth.status === "signedOut" && !auth.configured) {
    const isDev = process.env.NODE_ENV !== "production";
    return (
      <div className="app-shell-canvas flex min-h-svh items-center justify-center px-6">
        <div className="neu-panel bg-surface max-w-md rounded-2xl p-6">
          <h1 className="text-on-surface text-base font-medium">
            {isDev ? "Sign-in isn't configured" : "Service temporarily unavailable"}
          </h1>
          <p className="text-on-surface-variant mt-2 text-sm leading-relaxed">
            {isDev ? (
              <>
                Set <code className="text-body-sm font-mono">NEXT_PUBLIC_COGNITO_AUTHORITY</code> and{" "}
                <code className="text-body-sm font-mono">NEXT_PUBLIC_COGNITO_CLIENT_ID</code> to use the deployed stack,
                or run with <code className="text-body-sm font-mono">NEXT_PUBLIC_API_MOCK=1</code> for the offline demo.
              </>
            ) : (
              "The sign-in service is not available right now. Please try again later."
            )}
          </p>
        </div>
      </div>
    );
  }

  return <Splash label={auth.status === "signedOut" ? "Redirecting to sign-in…" : "Loading…"} />;
}

function SidebarDrawer() {
  const { sidebarOpen, setSidebarOpen } = useChatShell();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    closeRef.current?.focus();
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
        className={`bg-scrim fixed inset-0 z-40 transition-opacity duration-250 ${sidebarOpen ? "opacity-100" : "opacity-0"}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chat sessions"
        className={`fixed inset-y-0 left-0 z-50 w-[min(18.5rem,calc(100vw-3rem))] p-3 transition-transform duration-250 [transition-timing-function:var(--neu-ease)] ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative h-full">
          <SessionSidebar />
          <button
            ref={closeRef}
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sessions"
            className="neu-button bg-surface text-on-surface-variant hover:text-primary absolute top-3 right-3 flex size-11 items-center justify-center rounded-xl sm:size-8"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { sidebarOpen, setSidebarOpen, mapOpen, setMobileMapOpen, mobileMapOpen, highlight } = useChatShell();
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);
  const sessionsMenuRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

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
          className="bg-primary text-on-primary fixed top-2 left-2 z-[100] rounded-xl px-4 py-2 text-sm font-medium opacity-0 focus:opacity-100"
        >
          Skip to main content
        </a>
        <motion.header
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          inert={sidebarOpen || mobileMapOpen || undefined}
          className="neu-panel relative z-30 mx-2 mt-3 flex h-14 shrink-0 items-center justify-between rounded-2xl px-2 sm:mx-3 sm:px-4"
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sessions"
              className="neu-button bg-surface text-on-surface-variant hover:text-primary flex size-11 shrink-0 items-center justify-center rounded-xl sm:size-9 lg:hidden"
            >
              <Icon name="menu" size={21} />
            </button>
            <Link
              href="/"
              aria-label="Go to Reogent homepage"
              className="group flex min-w-0 items-center gap-2 rounded-xl py-1 pr-2 focus-visible:outline-offset-4"
            >
              <span className="bg-surface-container-low text-primary hidden size-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:-translate-y-0.5 sm:flex">
                <Icon name="school" size={17} />
              </span>
              <span className="text-primary group-hover:text-on-surface truncate text-base font-medium tracking-[-0.025em] transition-colors duration-150 sm:text-xl">
                Reogent
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMapOpen(true)}
              aria-label="Open campus map"
              className="neu-button bg-surface text-on-surface-variant hover:text-primary relative flex size-11 items-center justify-center rounded-xl sm:hidden sm:size-9"
            >
              <Icon name="map" size={19} />
              {highlight && !mobileMapOpen && (
                <span className="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full" aria-hidden="true" />
              )}
            </button>
            <ThemeToggle className="hidden sm:grid" />
            <UserMenu />
          </div>
        </motion.header>

        <div
          data-sessions-state={sessionsCollapsed ? "collapsed" : "expanded"}
          inert={sidebarOpen || mobileMapOpen || undefined}
          className="shell-body min-h-0 flex-1"
        >
          <SidebarDrawer />

          <main
            data-map-state={mapOpen ? "open" : "collapsed"}
            className="chat-workspace min-h-0 min-w-0 flex-1 gap-3 p-3"
          >
            <aside
              aria-label="Chat sessions"
              data-sessions-state={sessionsCollapsed ? "collapsed" : "expanded"}
              className="sessions-aside relative hidden min-h-0 min-w-0 overflow-hidden lg:block"
            >
              <div className="sessions-panel-layer h-full w-[17rem]">
                <SessionSidebar onCollapse={collapseSessions} />
              </div>
              <div
                className={`neu-panel text-on-surface-variant absolute inset-y-0 left-0 flex w-[3.75rem] flex-col items-center rounded-2xl py-3 transition-opacity duration-200 ${sessionsCollapsed ? "opacity-100" : "pointer-events-none opacity-0"}`}
              >
                <button
                  ref={sessionsMenuRef}
                  type="button"
                  onClick={expandSessions}
                  tabIndex={sessionsCollapsed ? 0 : -1}
                  aria-label="Expand session history"
                  aria-controls="desktop-session-panel"
                  aria-expanded={!sessionsCollapsed}
                  title="Expand sessions"
                  className="neu-panel text-primary hover:text-on-surface flex size-9 items-center justify-center rounded-xl transition-colors duration-150"
                >
                  <Icon name="menu" size={20} />
                </button>
                <span className="mt-4 text-xs font-medium tracking-[0.06em] select-none [writing-mode:vertical-rl]">
                  Sessions
                </span>
              </div>
            </aside>
            <div className="chat-map-area flex min-h-0 min-w-0 flex-1 gap-3">
              <div id="main-content" className="flex min-h-0 min-w-0 flex-1">
                {children}
              </div>
              <div className="map-aside hidden min-h-0 min-w-0 overflow-hidden sm:flex">
                <MapPanel />
              </div>
            </div>
          </main>
        </div>

        <MapBottomSheet />
      </div>
    </RequireAuth>
  );
}
