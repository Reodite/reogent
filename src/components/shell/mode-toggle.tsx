"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon, type IconName } from "@/src/components/icons";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { FloatingPanel } from "@/src/components/ui/floating-panel";
import { paneIdToSlug } from "@/src/lib/pane-route";
import { LAST_CHAT_PATH_KEY, LAST_TOOLS_PATH_KEY, LAST_UNITY_PATH_KEY, type ShellMode } from "@/src/lib/shell-mode";
import { AnimatePresence } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";

const DESTINATIONS: { mode: ShellMode; label: string; icon: IconName; guestLocked?: boolean }[] = [
  { mode: "ai", label: "AI", icon: "bling", guestLocked: true },
  { mode: "tools", label: "Tools", icon: "layer" },
  { mode: "unity", label: "Unity", icon: "group", guestLocked: true },
];

const LAST_PATH_KEYS: Record<ShellMode, string> = {
  ai: LAST_CHAT_PATH_KEY,
  tools: LAST_TOOLS_PATH_KEY,
  unity: LAST_UNITY_PATH_KEY,
};

function rememberCurrentPath(committedPathname?: string) {
  try {
    const path = window.location.pathname;
    if (committedPathname !== undefined && committedPathname !== path) return;
    const destination = DESTINATIONS.find(({ mode }) => pathnameMatchesMode(path, mode));
    if (destination) sessionStorage.setItem(LAST_PATH_KEYS[destination.mode], path);
  } catch {}
}

function pathnameMatchesMode(pathname: string, mode: ShellMode): boolean {
  const base = mode === "tools" ? "/tools" : mode === "unity" ? "/pulse" : "/chat";
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function ModeToggle({
  collapsed = false,
  onNavigate,
  presentation = "sidebar",
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  presentation?: "sidebar" | "bottom";
}) {
  const { mode, setMode, workspaceView } = useChatShell();
  const { isGuest } = useAppAuth();
  const navigation = useShellNavigation();
  const pathname = navigation.displayPathname;
  const [tooltip, setTooltip] = useState<string | null>(null);
  const tooltipAnchor = useRef<HTMLAnchorElement>(null);
  const tooltipId = useId();
  const bottom = presentation === "bottom";

  useEffect(() => {
    rememberCurrentPath(navigation.committedPathname);
  }, [navigation.committedPathname]);

  function hrefFor(next: ShellMode): string {
    if (next === "ai") return "/chat";
    if (next === "unity") return "/pulse";
    const slug = (workspaceView && paneIdToSlug(workspaceView.paneId)) ?? "map";
    return `/tools/${slug}`;
  }

  function isLocked(next: ShellMode): boolean {
    return Boolean(isGuest && DESTINATIONS.find((destination) => destination.mode === next)?.guestLocked);
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>, next: ShellMode) {
    if (isLocked(next)) {
      event.preventDefault();
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        tooltipAnchor.current = event.currentTarget;
        setTooltip(next);
      }
      return;
    }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (next === mode && pathnameMatchesMode(pathname, next)) {
      event.preventDefault();
      return;
    }

    rememberCurrentPath();

    let target = hrefFor(next);
    try {
      const last = sessionStorage.getItem(LAST_PATH_KEYS[next]);
      if (last && pathnameMatchesMode(last, next) && new URL(last, window.location.origin).pathname === last) {
        target = last;
      }
    } catch {}

    event.preventDefault();
    setMode(next);
    navigation.push(target);
    onNavigate?.();
  }

  return (
    <nav
      aria-label="Reodite areas"
      data-mode-navigation={presentation}
      data-mobile-mode-navigation={bottom || undefined}
      className={bottom ? "mobile-mode-bar" : undefined}
    >
      <ul
        className={
          bottom
            ? "relative grid h-15 grid-cols-3"
            : `flex gap-1 rounded-xl p-1 ${collapsed ? "flex-col items-center" : ""}`
        }
      >
        {bottom ? (
          <li
            aria-hidden="true"
            className="mobile-mode-indicator"
            style={{
              transform: `translateX(${DESTINATIONS.findIndex((destination) => destination.mode === mode) * 100}%)`,
            }}
          >
            <span />
          </li>
        ) : null}
        {DESTINATIONS.map((destination) => {
          const locked = isLocked(destination.mode);
          const active = mode === destination.mode;
          return (
            <li key={destination.mode} className={`relative ${collapsed && !bottom ? "" : "flex-1"}`}>
              <Link
                href={hrefFor(destination.mode)}
                data-mode-toggle
                aria-label={destination.label}
                aria-current={active ? "page" : undefined}
                aria-disabled={locked || undefined}
                aria-describedby={tooltip === destination.mode ? `${tooltipId}-${destination.mode}` : undefined}
                onClick={(event) => navigate(event, destination.mode)}
                onAuxClick={(event) => {
                  if (locked) event.preventDefault();
                }}
                onPointerEnter={(event) => {
                  if (!locked || event.pointerType === "touch") return;
                  tooltipAnchor.current = event.currentTarget;
                  setTooltip(destination.mode);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType !== "touch")
                    setTooltip((current) => (current === destination.mode ? null : current));
                }}
                onFocus={(event) => {
                  if (!locked) return;
                  tooltipAnchor.current = event.currentTarget;
                  setTooltip(destination.mode);
                }}
                onBlur={() => setTooltip((current) => (current === destination.mode ? null : current))}
                className={
                  bottom
                    ? `relative isolate flex h-15 w-full flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium transition-colors duration-150 outline-none ${active ? "text-primary" : "text-muted"}`
                    : `focus-visible:ring-primary/40 flex h-11 items-center rounded-lg text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 sm:h-9 ${
                        collapsed ? "w-11 justify-center sm:w-9" : "w-full justify-center gap-1.5"
                      } ${
                        locked
                          ? "opacity-40"
                          : active
                            ? "neu-inset bg-surface-container text-on-surface"
                            : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                      }`
                }
              >
                <Icon name={destination.icon} size={bottom ? 22 : 16} className="shrink-0" />
                {(bottom || !collapsed) && destination.label}
              </Link>
              <AnimatePresence initial={false}>
                {tooltip === destination.mode && (
                  <FloatingPanel
                    id={`${tooltipId}-${destination.mode}`}
                    anchorRef={tooltipAnchor}
                    onDismiss={() => setTooltip((current) => (current === destination.mode ? null : current))}
                    focusOnOpen={false}
                    role="tooltip"
                    className="bg-surface-container-high text-on-surface pointer-events-none w-max rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg"
                  >
                    Sign in to use {destination.label}.
                  </FloatingPanel>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
